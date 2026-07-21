#!/bin/bash
# install-compose-api.sh — unraid-mobile Compose 后端安装脚本(续 49.2)
#
# 在 unRAID 宿主上以 root 运行,幂等(重复执行安全)。
#
#   bash install-compose-api.sh <unRAID-apiKey>     # 直接给 key
#   bash install-compose-api.sh                     # 交互式输入 key(不回显)
#   bash install-compose-api.sh -y [apiKey]         # 跳过风险确认(自动化用)
#
# ⚠️ 风险说明(续 57,运行前必读):
#   本脚本会修改 unRAID 开机脚本 /boot/config/go —— 它是系统启动时执行的核心
#   脚本,改错可能导致开机异常。保障措施:修改前自动备份为 go.unraid-mobile-bak,
#   追加内容仅 3 行(带【unraid-mobile】标记),卸载时按标记删除即可恢复。
#   脚本执行时会要求输入 YES 确认知悉此风险(-y 跳过)。
#
# 它做什么:
#   1. 校验 compose.manager 插件已安装(Compose 功能的载体)
#   2. 写 /boot/config/plugins/unraid-mobile/apikey (flash 盘,chmod 600)
#   3. 装 api.php 正本到 /boot/config/plugins/unraid-mobile/
#      并 cp 到执行位置 /usr/local/emhttp/plugins/compose.manager/api.php
#   4. 往 /boot/config/go 加恢复钩子(tmpfs 重启后重建执行位置)
#
# 容器侧还需一个挂载(脚本最后会再提示):
#   -v /var/run/php-fpm.sock:/hostrun/php-fpm.sock
#
# api.php 来源: 优先用与本脚本同目录的 api.php;否则从 RAW_URL 下载。
set -euo pipefail

# 【续 49.4】公开版默认从 GitHub raw 拉 api.php(tag 固定版本)
RAW_URL="https://raw.githubusercontent.com/bear0328/unraid-mobile/v1.0.1/compose-api/api.php"
# 【续 50 D4-1】下载的 api.php 做 sha256 校验(防下载源被篡改);改动 api.php 后必须同步更新此值
EXPECTED_API_SHA256="b83f50b8fa2992bd82e6c3530f1e1c1da89535e34e5be12ffed3772ad88261f8"

PLUGIN_DIR="/boot/config/plugins/unraid-mobile"
EXEC_DIR="/usr/local/emhttp/plugins/compose.manager"
GO_FILE="/boot/config/go"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info() { echo "[install] $*"; }
die()  { echo "[install] ERROR: $*" >&2; exit 1; }

# ---------- 0. 环境校验 ----------
[ "$(id -u)" = "0" ] || die "需要 root 运行(要读写 /boot/config 和 /usr/local/emhttp)"
[ -d "$EXEC_DIR" ] || die "未检测到 compose.manager 插件($EXEC_DIR 不存在)。
请先在 unRAID 应用市场(Community Applications)安装 compose.manager,再运行本脚本。"
[ -S /var/run/php-fpm.sock ] || echo "[install] 警告: /var/run/php-fpm.sock 不存在,php-fpm 未运行?装完后 compose-api 会 502"

# ---------- 0.5 风险确认(续 57:改 /boot/config/go 前必须显式确认) ----------
ASSUME_YES=0
if [ "${1:-}" = "-y" ] || [ "${1:-}" = "--yes" ]; then
    ASSUME_YES=1
    shift
fi
if [ "$ASSUME_YES" != "1" ]; then
    cat << 'EOF'

⚠️  风险说明 —— 运行前请阅读
本脚本会修改 unRAID 开机脚本 /boot/config/go(系统启动核心脚本),
用于重启后恢复 compose-api。保障措施:
  · 修改前自动备份为 /boot/config/go.unraid-mobile-bak
  · 仅追加 3 行(带【unraid-mobile】标记),不改动你已有的任何行
  · 卸载: 删除 /boot/config/plugins/unraid-mobile/ 及 go 里标记的 3 行即可完全还原
EOF
    read -r -p "已知晓上述风险,确认继续? 输入 YES 继续,其他任意输入中止: " CONFIRM
    [ "$CONFIRM" = "YES" ] || die "用户未确认,已中止(未做任何修改)"
fi

# ---------- 1. 拿 apiKey ----------
APIKEY="${1:-${UNRAID_API_KEY:-}}"
if [ -z "$APIKEY" ]; then
    read -r -s -p "输入 unRAID API 密钥(与 App 里填的 GraphQL key 相同,不回显): " APIKEY
    echo
fi
[ -n "$APIKEY" ] || die "apiKey 为空"

# ---------- 2. 写 key 文件 ----------
mkdir -p "$PLUGIN_DIR"
# 【续 50 D4-1】umask 077 再创建,消除文件先 0644 后 chmod 600 的窗口期
(umask 077; printf '%s' "$APIKEY" > "$PLUGIN_DIR/apikey")
chmod 600 "$PLUGIN_DIR/apikey"
info "key 文件: $PLUGIN_DIR/apikey (600)"

# ---------- 3. 装 api.php ----------
if [ -f "$SCRIPT_DIR/api.php" ]; then
    cp "$SCRIPT_DIR/api.php" "$PLUGIN_DIR/api.php"
    info "api.php 来自脚本同目录"
elif [ -n "$RAW_URL" ]; then
    curl -fsSL "$RAW_URL" -o "$PLUGIN_DIR/api.php" || die "下载 api.php 失败: $RAW_URL"
    # 【续 50 D4-1】sha256 校验,不符即中止(本地同目录提供的 api.php 不校验,便于开发迭代)
    (cd "$PLUGIN_DIR" && echo "$EXPECTED_API_SHA256  api.php" | sha256sum -c -) \
        || die "api.php sha256 校验不符(期望 $EXPECTED_API_SHA256),已中止"
    info "api.php 下载自 $RAW_URL (sha256 校验通过)"
else
    die "脚本同目录没有 api.php,且 RAW_URL 未配置(发布前限制:请把 api.php 放到脚本旁边)"
fi
php -l "$PLUGIN_DIR/api.php" > /dev/null || die "api.php 语法检查失败,不安装"
cp "$PLUGIN_DIR/api.php" "$EXEC_DIR/api.php"
info "api.php: 正本 $PLUGIN_DIR/api.php → 执行位置 $EXEC_DIR/api.php"

# ---------- 4. go 钩子(幂等:先清旧行再追加) ----------
# 清掉历史版本钩子行(续 47/49 旧布局 + 本脚本以往安装)
sed -i.unraid-mobile-bak \
    -e '/【unraid-mobile/d' \
    -e '/tmpfs,重启后 api\.php 丢失/d' \
    -e '/compose\.manager\/api\.php/d' \
    "$GO_FILE"
cat >> "$GO_FILE" << 'EOF'
# 【unraid-mobile】compose-api 恢复钩子(install-compose-api.sh 安装)
# /usr/local/emhttp 是 tmpfs,重启后 api.php 丢失,从 flash 正本恢复
cp /boot/config/plugins/unraid-mobile/api.php /usr/local/emhttp/plugins/compose.manager/api.php
EOF
info "go 钩子已更新(旧备份: $GO_FILE.unraid-mobile-bak)"

# ---------- 5. 完成提示 ----------
cat << 'EOF'

[install] 完成。Compose 后端已就绪。

容器侧还需要一个挂载(如果还没加):
  -v /var/run/php-fpm.sock:/hostrun/php-fpm.sock
加完重建容器,App 的 容器/VM → Compose tab 即可看到栈列表。

go 文件备份: /boot/config/go.unraid-mobile-bak(如需还原直接覆盖回去)
卸载: 删掉 /boot/config/plugins/unraid-mobile/、
      /usr/local/emhttp/plugins/compose.manager/api.php、
      以及 /boot/config/go 里【unraid-mobile】标记的三行。
EOF
