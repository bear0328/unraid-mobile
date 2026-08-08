#!/bin/bash
# unraid-mobile dev 部署脚本
# 流程:本地 build → 本地 docker build → 本地 docker save → 只传白名单到 unraid → unraid 端 docker load + up
# 目的:unraid 端 appdata 保持最小(只 Dockerfile + default.conf + docker-compose.dev.yml + config/ + nginx/)
#
# 【2026-06-14 修复】mac 本机没装 Node.js,改用 docker 跑 node:22-alpine 做 build
# 之前 `npm run build` 卡住的真凶就是本机没 npm
#
# 【2026-06-14 改进】加 SSH 预检(避免 rsync 失败才发现连不上)+ rsync --partial --progress
#                  (网络抖动能断点续传)+ tar 文件去掉 -z(本身已压缩,免得二次 gzip)
#
# ⚠️  本脚本是"部署"脚本,会真实改动 unraid 服务器上的服务
# ⚠️  默认需要用户输入 yes 确认才会执行,加 --yes/-y 跳过确认
# ⚠️  加 --dry-run 只打印要做什么,不真实执行
#
# 【2026-06-15 流程拆分】开发/编译/部署分工:
#   - 仅做"开发+编译":跑 ./scripts/build.sh
#   - 部署到 unraid: 跑本脚本(默认需 yes 确认,或 --yes 跳过)
# AI 助手不会自动执行本脚本,除非用户明确告知"开始部署"

# 【续 50 D4-2】升级 set -euo pipefail(通读确认无依赖未定义变量的写法,-u 安全)
set -euo pipefail

UNRAID_HOST="root@192.168.6.140"
UNRAID_PORT="222"
UNRAID_DIR="/mnt/user/appdata/unraid-mobile-dev"
UNRAID_SSH="ssh -i ~/.ssh/mac_unraid_key -o PasswordAuthentication=no -p ${UNRAID_PORT}"

IMAGE_TAG="bear0328/unraid-mobile:dev"
TAR_NAME="unraid-mobile-dev.tar"

# 白名单文件
# 【D4 2026-06-14】加 nginx/.davpasswd - WebDAV 鉴权密码文件(bcrypt 加密,**不**进 git)
WHITELIST=(
  "Dockerfile"
  "default.conf"
  "docker-compose.dev.yml"
  "config"
  "nginx"
)

ASSUME_YES=false
DRY_RUN=false

# --- 工具函数 ---
log() {
  printf "%s %s\n" "[deploy-dev]" "$*"
}

die() {
  printf "%s %s\n" "[deploy-dev] ERROR:" "$*" >&2
  exit 1
}

ensure_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "required command not found: $1 (请安装 $1 后重试)"
  fi
}

show_help() {
  cat <<EOF
用法: $0 [--yes] [--dry-run]

选项:
  --yes / -y  跳过交互式确认(默认需要输入 yes 才部署)
  --dry-run   只打印要做什么,不真实执行
  --help / -h 显示帮助

⚠️  本脚本默认会要求用户输入 yes 才执行部署。AI 助手在用户明确告知"开始部署"
    之前不应自动调用本脚本(2026-06-15 流程拆分)。
EOF
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --yes|-y)
        ASSUME_YES=true
        shift
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      --help|-h)
        show_help
        exit 0
        ;;
      *)
        die "unknown argument: $1 (用 --help 看帮助)"
        ;;
    esac
  done
}

# 部署前确认门 —— 除非用户传入 --yes/-y,否则必须人工输入 yes 才执行
confirm_deploy() {
  if [ "${ASSUME_YES}" = true ]; then
    log "确认门: --yes 传入,跳过交互确认"
    return 0
  fi

  if [ "${DRY_RUN}" = true ]; then
    log "确认门: --dry-run 模式,跳过交互确认(不会真实改动 unraid)"
    return 0
  fi

  printf "\n"
  printf "⚠️  即将部署到 unraid 服务器:\n"
  printf "    主机:  %s:%s\n" "${UNRAID_HOST}" "${UNRAID_PORT}"
  printf "    目录:  %s\n" "${UNRAID_DIR}"
  printf "    模式:  dev (白名单激进同步,appdata 最小)\n"
  printf "\n"
  printf "    这会改动 unraid 上的服务状态。\n"
  printf "    输 yes 继续,输其它任意内容取消:\n"
  printf "    > "
  read -r answer
  if [ "${answer}" != "yes" ]; then
    die "部署已取消 (输入不是 'yes')"
  fi
  log "确认门: 用户已输入 yes,开始部署"
}

# dry-run 友好的命令封装器
run_cmd() {
  if [ "${DRY_RUN}" = true ]; then
    log "[DRY-RUN] $*"
    return 0
  fi
  "$@"
}

verify_ssh() {
  log "Pre-checking SSH connectivity to ${UNRAID_HOST}:${UNRAID_PORT}..."
  if ! ${UNRAID_SSH} ${UNRAID_HOST} "echo SSH_OK" >/dev/null 2>&1; then
    die "SSH 连接失败:请检查 ~/.ssh/mac_unraid_key 是否存在,unRAID 是否开机,端口 ${UNRAID_PORT} 是否通"
  fi
  log "SSH connectivity OK."
}

# --- 流程 ---
deploy() {
  echo "=== 1. 本地 build (docker node:22-alpine, 本机不需要装 Node.js) ==="
  run_cmd docker run --rm -v "$(pwd):/app" -w /app node:22-alpine sh -c \
    "npm config set registry https://registry.npmmirror.com && npm install && npm run build"

  echo "=== 2. 本地 docker build ==="
  run_cmd docker build --platform=linux/amd64 -t ${IMAGE_TAG} .

  echo "=== 3. 本地 docker save ==="
  # 【续 50 D4-3】去掉 sudo:本机是 Windows Docker Desktop,当前用户即有权限,sudo 反而可能失败(与 deploy-stable.sh 统一)
  run_cmd docker save ${IMAGE_TAG} -o /tmp/${TAR_NAME}
  run_cmd chmod 644 /tmp/${TAR_NAME}

  echo "=== 4. SSH 预检 ==="
  run_cmd verify_ssh

  echo "=== 5. 部署前远端 dist 快照(只留最近 3 个) ==="
  # 【续 50 D4-2】rsync/替换前先快照 appdata 的 dist;date 加 \$ 在远端展开
  run_cmd ${UNRAID_SSH} ${UNRAID_HOST} "cd ${UNRAID_DIR} && \
    if [ -d dist ]; then cp -a dist dist-prev-\$(date +%Y%m%d-%H%M); fi; \
    ls -1d dist-prev-* 2>/dev/null | sort | head -n -3 | xargs -r rm -rf"

  echo "=== 6. 传白名单文件 + tar 到 unraid ==="
  for f in "${WHITELIST[@]}"; do
    run_cmd rsync -avz --partial --progress -e "${UNRAID_SSH}" "./${f}" "${UNRAID_HOST}:${UNRAID_DIR}/"
  done
  # tar 已经是被 docker save 压缩过的,不再 -z
  run_cmd rsync -av --partial --progress -e "${UNRAID_SSH}" "/tmp/${TAR_NAME}" "${UNRAID_HOST}:${UNRAID_DIR}/"

  echo "=== 7. unraid 端 docker load + up + 清 tar ==="
  run_cmd ${UNRAID_SSH} ${UNRAID_HOST} "cd ${UNRAID_DIR} && \
    docker load -i ${TAR_NAME} > /dev/null && \
    docker compose -f docker-compose.dev.yml up -d && \
    rm -f ${TAR_NAME}"

  echo "=== 8. 清本地 /tmp tar ==="
  run_cmd rm -f /tmp/${TAR_NAME}

  echo "=== 部署完成 ==="
  echo "访问地址: http://$(echo ${UNRAID_HOST} | cut -d@ -f2):3998"
}

main() {
  parse_args "$@"
  # 【2026-06-15】部署前确认门 —— 默认必须输入 yes 才执行
  confirm_deploy
  deploy
}

main "$@"
