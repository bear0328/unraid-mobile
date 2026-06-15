#!/bin/bash
# unraid-mobile 本地编译脚本
# 职责:仅在本地完成"开发 → 编译"动作,不触碰 unraid 服务器
# 任何 ssh/rsync/远程 docker load/compose up 都属于"部署"范畴,本脚本不做
#
# 默认行为:前端 build + docker 镜像 build + docker save 到 /tmp
# 可选:
#   --no-image    只跑前端 build,不构建 docker 镜像
#   --no-save     构建 docker 镜像但不 save(用于调试 Dockerfile)
#   --help        显示帮助
#
# 退出码:
#   0  成功
#   非0 失败
#
# 【2026-06-15 新增】开发流程拆分:本脚本只做"开发+编译",不部署
# 部署需用户明确确认后,由 ./deploy-stable.sh 或 ./deploy-dev.sh 执行

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_TAG="bear0328/unraid-mobile:dev"
TAR_NAME="unraid-mobile-dev.tar"

BUILD_IMAGE=true
SAVE_IMAGE=true

log() {
  printf "%s %s\n" "[build]" "$*"
}

die() {
  printf "%s %s\n" "[build] ERROR:" "$*" >&2
  exit 1
}

show_help() {
  cat <<EOF
用法: $0 [选项]

选项:
  --no-image   只跑前端 build(npm run build),不构建 docker 镜像
  --no-save    构建 docker 镜像但不 save 到 tar(用于调试 Dockerfile)
  --help       显示此帮助

默认行为:前端 build + docker 镜像 build + docker save 到 /tmp/${TAR_NAME}

【重要】本脚本是"开发+编译"工具,不做部署。
要部署到 unraid 请运行 ./deploy-stable.sh 或 ./deploy-dev.sh,且需用户确认。
EOF
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --no-image)
        BUILD_IMAGE=false
        shift
        ;;
      --no-save)
        SAVE_IMAGE=false
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

ensure_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "required command not found: $1"
  fi
}

build_frontend() {
  log "=== Step 1/3: 前端 build (docker node:22-alpine, 本机不需要装 Node.js) ==="
  cd "${PROJECT_ROOT}"
  docker run --rm -v "$(pwd):/app" -w /app node:22-alpine sh -c \
    "npm config set registry https://registry.npmmirror.com && \
     npm install --no-audit --no-fund && \
     npm run build"
  log "前端 build 完成 → dist/"
}

build_image() {
  log "=== Step 2/3: docker 镜像 build (--platform=linux/amd64) ==="
  cd "${PROJECT_ROOT}"
  docker build --platform=linux/amd64 -t "${IMAGE_TAG}" .
  log "镜像 build 完成 → ${IMAGE_TAG}"
}

save_image() {
  log "=== Step 3/3: docker save → /tmp/${TAR_NAME} (仅本地,不传 unraid) ==="
  docker save "${IMAGE_TAG}" -o "/tmp/${TAR_NAME}"
  chmod 644 "/tmp/${TAR_NAME}"
  log "镜像 save 完成 → /tmp/${TAR_NAME} ($(du -h /tmp/${TAR_NAME} | cut -f1))"
}

main() {
  parse_args "$@"
  ensure_tool docker

  log "项目根目录: ${PROJECT_ROOT}"
  log "本脚本只做本地编译,不做部署。"

  build_frontend

  if [ "${BUILD_IMAGE}" = true ]; then
    build_image
    if [ "${SAVE_IMAGE}" = true ]; then
      save_image
    fi
  fi

  log "=== 本地编译全部完成 ==="
  log "产物:"
  log "  - dist/                 前端静态资源"
  if [ "${BUILD_IMAGE}" = true ]; then
    log "  - docker ${IMAGE_TAG}  本地镜像"
    if [ "${SAVE_IMAGE}" = true ]; then
      log "  - /tmp/${TAR_NAME}    镜像 tar 包"
    fi
  fi
  log ""
  log "下一步(需用户明确确认才执行):"
  log "  ./deploy-stable.sh             # 默认 simple 模式,只换前端静态资源"
  log "  ./deploy-stable.sh --mode dev  # 完整镜像重做"
  log "  ./deploy-dev.sh                # 白名单激进同步"
}

main "$@"
