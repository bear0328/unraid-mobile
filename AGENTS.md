# AGENTS.md — unraid-mobile 项目约束（Kimi Code CLI 必读）

> 本文件是进入本项目的必读约束。任何代码/配置/部署动作前，先确认不违反以下条款。
> 详细历史与排障记录见 `DEV_PROGRESS.md`（本地，gitignored)。

## 1. 红线条款（unRAID 宿主侧）

允许修改的宿主路径**只有 5 处**:

1. `/boot/config/go` — 仅追加带 `# unraid-mobile` 标记的恢复钩子
   （从 flash 正本 cp api.php 到 doc_root tmpfs 执行位置）
2. `/boot/config/plugins/unraid-mobile/` — api.php 正本、apikey(sha256 哈希）、audit.log
3. `/usr/local/emhttp/plugins/compose.manager/api.php` — api.php 执行位置
   （tmpfs，重启丢失，只经 go 钩子/安装脚本从正本恢复，不单独手改）
4. `/mnt/user/appdata/unraid-mobile-dev/` 和 `/mnt/user/appdata/unraid-mobile/`
   — dev/prod 应用数据目录（dist、config、compose 文件）
5. `/boot/config/plugins/compose.manager/projects/` — compose 栈项目目录
   （仅经 compose-api/api.php 读写，不直接手改）

**其余 unRAID 宿主系统文件一律不动。** 任何新功能若必须突破此范围，
必须先向用户提案并经显式授权，不得自行实施。

### 数据侧红线（同样不可违反）

- **不唤醒休眠盘**:`getDisks`/statfs 会唤盘，磁盘数据只在用户显式刷新时拉取；
  CPU 温度走 compose-api `/sys/class/hwmon`(sysfs，不碰块设备）。
- `SYSTEM_INFO_QUERY` **永禁 temperature 字段**(GraphQL metrics.temperature
  会触发 unraid-api 跑 smartctl 全扫唤盘）。
- 容器/VM 轮询 60s 地板（`CONTAINER_POLL_FLOOR_MS`)，设置间隔再小也不突破。

## 2. 工作流

- **Hermes 只做 PM/调度/只读验证/汇报**,不直接写项目代码/配置，不直接 build/deploy。
- **所有项目文件改动由 Kimi Code CLI 执行**(Read/Edit/Write + bash)。
- dev 端口 **3998**(http://192.168.6.140:3998),prod 端口 **3999**。
- **dev 验证通过后，才能 commit/push/deploy prod**;git 变更类操作
  (commit/push/tag/reset/rebase）每次都要用户显式确认。
- **vitest + lint + build 是每次代码改动后的强制步骤**:
  `npx vitest run` → `npm run lint` → `npm run build`，全绿才允许部署。
- 部署后必须冒烟：`curl` 目标端口返回 200，且远端 bundle hash 与本地 `dist/` 一致。
- `DEV_PROGRESS.md` 仅本地保存（gitignored，无版本控制兜底）,
  每次大节点同步备份到 `.tmp/` 并核对 sha256。
- SSH:`ssh -i ~/.ssh/mac_unraid_key -p 222 root@192.168.6.140`
  （必须 `-o IdentitiesOnly=yes` 或等效，否则 agent 多 key 会认证失败）。

## 3. 当前项目状态（2026-08-10，供参考）

- 当前版本 **v1.2.1**(GitHub commit `e97de1c` + tag;Docker Hub `:1.2.1`/`:latest` 已推送；digest `sha256:458c04aca2db2de79ffa0123d6a23b707d4a91e2ea9a057157e7655dd5e3f6f4`）。
- dev(3998)/prod(3999) 均运行 bundle `index-RoB7ta90.js`。
- 最新状态以 `DEV_PROGRESS.md` 头部「最后更新」行为准，本段只作快照。
