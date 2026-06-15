#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# ⚠️  本脚本是"部署"脚本,会真实改动 unraid 服务器上的服务
# ⚠️  默认需要用户输入 yes 确认才会执行,加 --yes/-y 跳过确认
# ⚠️  加 --dry-run 只打印要做什么,不真实执行
#
# 更稳定的部署脚本
# 默认模式: simple
# 简单静态部署: build -> rsync dist/nginx.conf -> restart 容器
# 开发镜像部署: build -> docker build -> save -> rsync 文件 + tar -> remote load + compose up
#
# 【2026-06-15 流程拆分】开发/编译/部署分工:
#   - 仅做"开发+编译":跑 ./scripts/build.sh
#   - 部署到 unraid: 跑本脚本(默认需 yes 确认,或 --yes 跳过)
# AI 助手不会自动执行本脚本,除非用户明确告知"开始部署"

MODE_DEFAULT="simple"
SSH_USER="root"
SSH_HOST="192.168.6.140"
SSH_PORT="222"
SSH_KEY="${HOME}/.ssh/mac_unraid_key"
REMOTE_DIR="/mnt/user/appdata/unraid-mobile-dev"
IMAGE_TAG="bear0328/unraid-mobile:dev"
TAR_NAME="unraid-mobile-dev.tar"
REMOTE_COMPOSE_FILE="docker-compose.dev.yml"
CONTAINER_NAME="unraid-mobile-dev"

MODE="${MODE_DEFAULT}"
RETRY_COUNT=3
RETRY_SLEEP=5
ASSUME_YES=false
DRY_RUN=false

log() {
  printf "%s %s\n" "[deploy-stable]" "$*"
}

die() {
  printf "%s %s\n" "[deploy-stable] ERROR:" "$*" >&2
  exit 1
}

retry() {
  local attempts=0
  local cmd
  cmd="$*"

  until eval "$cmd"; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge "$RETRY_COUNT" ]; then
      die "command failed after ${RETRY_COUNT} attempts: $cmd"
    fi
    log "command failed, retrying (${attempts}/${RETRY_COUNT}) in ${RETRY_SLEEP}s..."
    sleep "$RETRY_SLEEP"
  done
}

ensure_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "required command not found: $1"
  fi
}

run_remote() {
  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "$*"
}

show_help() {
  cat <<EOF
Usage: $0 [--mode simple|dev] [--host HOST] [--port PORT] [--ssh-key KEY] [--yes] [--dry-run]

Options:
  --mode      simple (default) | dev
  --host      SSH host for unRAID
  --port      SSH port
  --ssh-key   SSH private key
  --yes / -y  跳过交互式确认(默认需要输入 yes 才部署)
  --dry-run   只打印要做什么,不真实执行
  --help / -h 显示帮助

⚠️  本脚本默认会要求用户输入 yes 才执行部署。AI 助手在用户明确告知"开始部署"
    之前不应自动调用本脚本(2026-06-15 流程拆分)。
EOF
}

# 部署前确认门 —— 除非用户传入 --yes/-y,否则必须人工输入 yes 才执行
confirm_deploy() {
  if [ "${ASSUME_YES}" = true ]; then
    log "确认门: --yes 传入,跳过交互确认"
    return 0
  fi

  # dry-run 模式下不需要二次确认,本身就不会真实改动
  if [ "${DRY_RUN}" = true ]; then
    log "确认门: --dry-run 模式,跳过交互确认(不会真实改动 unraid)"
    return 0
  fi

  printf "\n"
  printf "⚠️  即将部署到 unraid 服务器:\n"
  printf "    主机:  %s:%s\n" "${SSH_HOST}" "${SSH_PORT}"
  printf "    目录:  %s\n" "${REMOTE_DIR}"
  printf "    模式:  %s\n" "${MODE}"
  printf "    容器:  %s\n" "${CONTAINER_NAME}"
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

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --mode)
        MODE="$2"
        shift 2
        ;;
      --host)
        SSH_HOST="$2"
        shift 2
        ;;
      --port)
        SSH_PORT="$2"
        shift 2
        ;;
      --ssh-key)
        SSH_KEY="$2"
        shift 2
        ;;
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
        die "unknown argument: $1"
        ;;
    esac
  done

  if [ "$MODE" != "simple" ] && [ "$MODE" != "dev" ]; then
    die "unsupported mode: $MODE"
  fi
}

verify_environment() {
  ensure_tool docker
  ensure_tool ssh
  ensure_tool rsync
  ensure_tool awk
  ensure_tool tar
}

build_frontend() {
  log "Building frontend in Docker..."
  docker run --rm -v "$(pwd):/app" -w /app node:22-alpine sh -lc \
    'npm config set registry https://registry.npmmirror.com && npm install --no-audit --no-fund && npm run build'
  log "Frontend build finished."
}

verify_ssh() {
  log "Verifying SSH connectivity to ${SSH_HOST}:${SSH_PORT}..."
  retry run_remote 'echo SSH_OK'
  log "SSH connectivity OK."
}

deploy_simple() {
  build_frontend

  log "Syncing dist to remote..."
  # 【续 50 D4-2】rsync --delete 前先快照远端 dist,只保留最近 3 个(更老的删掉)
  run_remote "cd ${REMOTE_DIR} && if [ -d dist ]; then cp -a dist dist-prev-\$(date +%Y%m%d-%H%M); fi; ls -1d dist-prev-* 2>/dev/null | sort | head -n -3 | xargs -r rm -rf"
  rsync -avz --delete --partial --progress -e "ssh -i ${SSH_KEY} -p ${SSH_PORT}" ./dist/ "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/dist/"

  log "Syncing nginx.conf to remote..."
  rsync -avz -e "ssh -i ${SSH_KEY} -p ${SSH_PORT}" ./nginx.conf "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

  log "Restarting remote container '${CONTAINER_NAME}'..."
  # 先 inspect 再 restart:容器不存在时不要假成功(以前用 || true 会掩盖错误)
  if run_remote "docker inspect ${CONTAINER_NAME} >/dev/null 2>&1"; then
    run_remote "docker restart ${CONTAINER_NAME}"
    log "Container '${CONTAINER_NAME}' restarted."
  else
    log "WARN: container '${CONTAINER_NAME}' does not exist on remote. Skipping restart."
    log "      (镜像未更新,只换了 dist+nginx.conf;如需创建容器请用 --mode dev)"
  fi
  log "Simple deployment finished."
}

deploy_dev() {
  build_frontend

  log "Building local Docker image ${IMAGE_TAG}..."
  docker build --platform=linux/amd64 -t "${IMAGE_TAG}" .

  log "Saving image to tar..."
  tmp_tar="/tmp/${TAR_NAME}"
  docker save "${IMAGE_TAG}" -o "${tmp_tar}"
  chmod 644 "${tmp_tar}"

  log "Syncing project files to remote..."
  for path in Dockerfile default.conf "${REMOTE_COMPOSE_FILE}" config nginx; do
    rsync -avz -e "ssh -i ${SSH_KEY} -p ${SSH_PORT}" "${path}" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"
  done

  log "Syncing image tar to remote..."
  rsync -avz -e "ssh -i ${SSH_KEY} -p ${SSH_PORT}" "${tmp_tar}" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/${TAR_NAME}"

  log "Loading image and restarting compose on remote..."
  run_remote "cd ${REMOTE_DIR} && docker load -i ${TAR_NAME} >/dev/null && docker compose -f ${REMOTE_COMPOSE_FILE} up -d && rm -f ${TAR_NAME}"

  rm -f "${tmp_tar}"
  log "Dev deployment finished."
}

main() {
  parse_args "$@"
  verify_environment
  verify_ssh

  # 【2026-06-15】部署前确认门 —— 默认必须输入 yes 才执行
  confirm_deploy

  if [ "$MODE" = "simple" ]; then
    deploy_simple
  else
    deploy_dev
  fi
}

main "$@"
