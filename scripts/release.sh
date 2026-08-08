#!/usr/bin/env bash
# 【续 76】发布脚本:本地构建 → GitHub / Docker Hub / unRAID(dev+prod)
# 【续 84】构建机从 Windows 迁到 Mac mini:删 DOCKER_BIN(Git Bash 专用)、
#         sha256sum → shasum、GNU sed -i → BSD sed -i ''(macOS 自带工具)
# 用法:
#   ./scripts/release.sh <版本号> "<commit 摘要>" [--yes] [--dry-run] [--skip-deploy]
# 例:
#   ./scripts/release.sh 1.0.5 "刷新间隔修复 + 全局刷新时间"
#
# 步骤(失败即中止):
#   1. 前置检查(docker/登录/git/ssh)
#   2. vitest + lint + build
#   3. 版本引用(install-compose-api.sh RAW_URL+sha256、双语 README)
#   4. git commit + tag + push
#   5. docker build + push(latest + 版本 tag)
#   6. 部署 dev(3998):dist 直传
#   7. 部署 prod(3999):compose 改 tag pull 重建
#   8. 冒烟:3998/3999 均 200 + bundle hash 与本地 dist 一致
#
# 确认门:默认需输入 yes,--yes 跳过;--dry-run 只打印不执行
set -euo pipefail
IFS=$'\n\t'

# ---------- 配置 ----------
IMAGE_REPO="bear0328/unraid-mobile"
SSH_USER="root"
SSH_HOST="192.168.6.140"
SSH_PORT="222"
SSH_KEY="${HOME}/.ssh/mac_unraid_key"
DEV_DIR="/mnt/user/appdata/unraid-mobile-dev"
PROD_DIR="/mnt/user/appdata/unraid-mobile"
DEV_PORT=3998
PROD_PORT=3999

# 国内构建 npm 走 npmmirror(官方源直连极慢,实测 4MB/s vs 91KB/s);海外改回官方源
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

ASSUME_YES=false
DRY_RUN=false
SKIP_DEPLOY=false

log()  { printf "%s %s\n" "[release]" "$*"; }
die()  { printf "%s %s\n" "[release] ERROR:" "$*" >&2; exit 1; }
run()  { if [ "${DRY_RUN}" = true ]; then log "DRY: $*"; else eval "$@"; fi; }

# ---------- 参数 ----------
[ $# -ge 2 ] || die "用法: $0 <版本号> \"<commit 摘要>\" [--yes] [--dry-run] [--skip-deploy]"
VERSION="$1"; shift
MESSAGE="$1"; shift
[[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "版本号格式应为 x.y.z,收到: ${VERSION}"
TAG="v${VERSION}"

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y)      ASSUME_YES=true; shift ;;
    --dry-run)     DRY_RUN=true; shift ;;
    --skip-deploy) SKIP_DEPLOY=true; shift ;;
    *)             die "未知参数: $1" ;;
  esac
done

# ---------- 确认门 ----------
if [ "${ASSUME_YES}" = false ] && [ "${DRY_RUN}" = false ]; then
  printf "\n⚠️  即将发布 %s:\n" "${TAG}"
  printf "    构建+推送: GitHub(master+tag)/ Docker Hub(latest+%s)/ unRAID(dev+prod)\n" "${VERSION}"
  printf "    commit 摘要: %s\n" "${MESSAGE}"
  printf "    输 yes 继续: > "
  read -r answer
  [ "${answer}" = "yes" ] || die "已取消"
fi

# ---------- 1. 前置检查 ----------
log "=== 1/8 前置检查 ==="
command -v docker >/dev/null || die "docker 不在 PATH(未安装 Docker Desktop?)"
docker version --format '{{.Server.Version}}' >/dev/null 2>&1 || die "Docker daemon 未就绪(启动 Docker Desktop)"
# 登录态检查:credsStore(desktop)或非空 auths 均视为已登录;push 失败会自行中止
grep -Eq '"credsStore"|"auth": "[^"]+"' "${HOME}/.docker/config.json" 2>/dev/null \
  || die "未 docker login(先 docker login -u bear0328)"
git rev-parse --is-inside-work-tree >/dev/null || die "不在 git 仓库内"
git fetch origin master --quiet
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/master)" ] || die "本地 master 与 origin 不一致,先 pull/push 对齐"
ssh -i "${SSH_KEY}" -o BatchMode=yes -o ConnectTimeout=10 -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" 'echo SSH_OK' >/dev/null || die "ssh 不通宿主"
if git tag -l "${TAG}" | grep -q .; then die "tag ${TAG} 已存在"; fi

# ---------- 2. 测试 + 构建 ----------
log "=== 2/8 vitest + lint + build ==="
run "npx vitest run" || die "测试失败,中止发布"
run "npm run lint"  || die "lint 失败,中止发布"
run "npm run build" || die "build 失败,中止发布"

# ---------- 3. 版本引用 ----------
log "=== 3/8 版本引用 → ${TAG} ==="
INSTALL_SH="compose-api/install-compose-api.sh"
OLD_TAG=$(sed -n 's|.*unraid-mobile/\(v[0-9.]*\)/compose-api/api\.php.*|\1|p' "${INSTALL_SH}" | head -1)
[ -n "${OLD_TAG}" ] || die "从 ${INSTALL_SH} 提取旧 tag 失败"
OLD_VER="${OLD_TAG#v}"
NEW_SHA=$(shasum -a 256 compose-api/api.php | cut -d' ' -f1)
log "旧版本 ${OLD_TAG} → ${TAG};api.php sha256=${NEW_SHA:0:8}…"
run "sed -i '' 's|/v[0-9]*\\.[0-9]*\\.[0-9]*/compose-api/api.php|/${TAG}/compose-api/api.php|; s|^EXPECTED_API_SHA256=.*|EXPECTED_API_SHA256=\"${NEW_SHA}\"|' ${INSTALL_SH}"
run "sed -i '' 's/${OLD_VER//\./\\.}/${VERSION}/g' README.md README_CN.md"
if [ "${DRY_RUN}" = false ]; then
  grep -q "EXPECTED_API_SHA256=\"${NEW_SHA}\"" "${INSTALL_SH}" || die "sha256 写入未生效"
  grep -q "/${TAG}/compose-api/install-compose-api.sh" README.md || die "README 版本号写入未生效"
fi

# ---------- 4. git ----------
log "=== 4/8 git commit + tag + push ==="
run "git add -A"
run "git commit -m 'v${VERSION}: ${MESSAGE}'"
run "git tag ${TAG}"
run "git push origin master"
run "git push origin ${TAG}"

# ---------- 5. docker build + push ----------
log "=== 5/8 docker build + push(${IMAGE_REPO}:latest + :${VERSION}) ==="
run "docker build --platform=linux/amd64 --build-arg NPM_REGISTRY=${NPM_REGISTRY} -t ${IMAGE_REPO}:latest -t ${IMAGE_REPO}:${VERSION} ."
run "docker push ${IMAGE_REPO}:${VERSION}"
run "docker push ${IMAGE_REPO}:latest"

# ---------- 6/7. 部署 ----------
if [ "${SKIP_DEPLOY}" = true ]; then
  log "=== 6-7/8 跳过部署(--skip-deploy) ==="
else
  log "=== 6/8 部署 dev(${DEV_PORT}) ==="
  SSH_OPT="-i ${SSH_KEY} -o BatchMode=yes -o StrictHostKeyChecking=no -P ${SSH_PORT}"
  # COPYFILE_DISABLE=1:macOS bsdtar 会把 xattr 打成 ._ AppleDouble 垃圾文件(续 85 实证 33 个)
  run "cd dist && COPYFILE_DISABLE=1 tar -czf /tmp/um-dist.tar.gz . && cd .."
  run "scp ${SSH_OPT} /tmp/um-dist.tar.gz ${SSH_USER}@${SSH_HOST}:/tmp/"
  run "ssh -i ${SSH_KEY} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'cd ${DEV_DIR}/dist && find . -mindepth 1 -delete && tar -xzf /tmp/um-dist.tar.gz && chmod -R a+rX . && rm /tmp/um-dist.tar.gz'"

  log "=== 7/8 部署 prod(${PROD_PORT}) ==="
  run "ssh -i ${SSH_KEY} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'cd ${PROD_DIR} && cp docker-compose.yml docker-compose.yml.bak-${OLD_TAG} && sed -i \"s|${IMAGE_REPO}:[0-9.]*|${IMAGE_REPO}:${VERSION}|\" docker-compose.yml && docker compose pull && docker compose up -d'"
fi

# ---------- 8. 冒烟 ----------
log "=== 8/8 冒烟验证 ==="
LOCAL_BUNDLE=$(grep -o 'index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)
if [ "${DRY_RUN}" = false ]; then
  sleep 5
  for port in ${DEV_PORT} ${PROD_PORT}; do
    [ "${SKIP_DEPLOY}" = true ] && [ "${port}" = "${DEV_PORT}" ] && continue
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://${SSH_HOST}:${port}/")
    [ "${code}" = "200" ] || die "端口 ${port} 返回 ${code}(期望 200)"
    bundle=$(curl -s "http://${SSH_HOST}:${port}/" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)
    [ "${bundle}" = "${LOCAL_BUNDLE}" ] || die "端口 ${port} bundle=${bundle} != 本地 ${LOCAL_BUNDLE}"
    log "端口 ${port}: 200 + bundle ${bundle} ✓"
  done
else
  log "DRY: 验证 ${DEV_PORT}/${PROD_PORT} 200 + bundle=${LOCAL_BUNDLE}"
fi

log "=== 发布 ${TAG} 完成 ==="
