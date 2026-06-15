#!/bin/bash
# 【续 45 2026-06-26】刷新唤盘修复 inotify 验证脚本
# 在 unRAID 服务器上跑,对比"修复前后"刷新页面唤醒 array 盘的事件数
#
# 用法:在开发机跑
#   ssh -i ~/.ssh/mac_unraid_key -p 222 root@192.168.6.140 'bash -s' < scripts/verify-refresh-disk.sh
#
# 设计:
#   Phase A (60s baseline): 无活动
#   Phase B (60s simulate-OLD-refresh): 每 10s curl 4 端点 health check + graphql 1 次
#     → 模拟"修复前"每次刷新都会打 /files/ /graphql
#   Phase C (60s simulate-NEW-refresh): 每 10s 只 curl / (index.html)
#     → 模拟"修复后"刷新页面后,JS 加载但健康 cache 命中,不触 /files/ /graphql
#   Phase D (60s simulate-NEW-with-poll): 每 10s 只 curl /
#     + 60s 后才 fetch 1 次 (因为 cache TTL 过期)
#     → 模拟"修复后"长期停留,刷新只命中 cache
#
# 期望:
#   Phase A 事件 ≈ 0 (服务器空闲,可能 mover/find 有点 IO)
#   Phase B 事件 >> Phase A (每次 curl 都唤 array)
#   Phase C 事件 ≈ Phase A (只 curl /,不触后端业务 endpoint)
#   Phase D 事件 ≈ Phase A + 偶尔一次 (cache TTL 过期后 1 次 fetch)

set -e

DURATION_A=60
DURATION_B=60
DURATION_C=60
DURATION_D=60
SERVER="http://localhost:3998"
DISKS="/mnt/disk1 /mnt/disk2 /mnt/disk3"
LOG=/tmp/refresh-disk-verify.log

echo "=== Refresh-disk verification $(date '+%F %T') ===" | tee "$LOG"

# 确保工具
command -v inotifywatch >/dev/null || { echo "missing inotifywatch"; exit 1; }

phase() {
  local name=$1 duration=$2
  local cmd=$3
  local outfile=/tmp/refresh-disk-$name.txt
  echo "--- Phase $name (${duration}s) ---" | tee -a "$LOG"
  echo "cmd: $cmd" | tee -a "$LOG"
  inotifywatch -t "$duration" -r -e access -e modify -e open -e close_write -e close_nowrite $DISKS > "$outfile" 2>&1 &
  local watch_pid=$!
  # 立刻跑测试命令(curl 风暴)
  bash -c "$cmd" &
  local cmd_pid=$!
  wait $watch_pid
  wait $cmd_pid
  # 汇总
  echo "events:" | tee -a "$LOG"
  cat "$outfile" | tee -a "$LOG"
  echo "" | tee -a "$LOG"
}

# Phase A:baseline
phase "A-baseline" $DURATION_A "true"  # true 是 no-op

# Phase B:模拟"旧前端刷新"——每 10s 打 4 端点 health + 1 个 graphql
# 60s 内打 6 次,每次 4 端点 + 1 graphql = 5 endpoints × 6 = 30 calls
phase "B-old-refresh" $DURATION_B "
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null '$SERVER/healthz' &
  curl -s -o /dev/null '$SERVER/files/' &
  curl -s -o /dev/null '$SERVER/config/settings.json' &
  curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -d '{\"query\":\"{ online }\"}' '$SERVER/graphql' &
  wait
  sleep 5
done
"

# Phase C:模拟"新前端刷新(60s 内)"——只 curl /,不触发后端业务
phase "C-new-refresh" $DURATION_C "
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null '$SERVER/'  # 只拉 index.html,JS bundle 由 SW cache 命中
  sleep 10
done
"

# Phase D:模拟"新前端刷新(长期停留)"——60s 内只 curl /,60s 后再触发 1 次(模拟 cache 过期)
phase "D-new-long-term" $DURATION_D "
for i in 1 2 3 4 5; do
  curl -s -o /dev/null '$SERVER/'
  sleep 10
done
# 60s mark:cache 过期,触发 1 次(等同首次挂载)
sleep 1
curl -s -o /dev/null '$SERVER/healthz' &
curl -s -o /dev/null '$SERVER/files/' &
wait
"

echo "=== Verification complete ===" | tee -a "$LOG"
echo "log: $LOG"
