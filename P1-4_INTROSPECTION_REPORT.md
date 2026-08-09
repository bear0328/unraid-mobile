# P1-4 GraphQL Mutation Introspection 报告

> 时间：2026-08-09（续 95）
> 目标：确认 unraid-api GraphQL mutation 是否支持 array/parity/docker/vm 常用控制
> 方式：对 dev 环境 unraid-api 做 `__schema { mutationType }` introspection 查询（仅列字段，未执行任何实际 mutation）

## Introspection 结果

### ArrayMutations

- `setState(input: { desiredState: START | STOP })` → 阵列启停
- `addDiskToArray` / `removeDiskFromArray` / `mountArrayDisk` / `unmountArrayDisk` / `clearArrayDiskStatistics`
- **无 `spinDown` / `spinUp` 字段**

### ParityCheckMutations

- `start(correct: Boolean)` → 开始校验（`correct: true` 为纠错模式）
- `pause` / `resume` / `cancel`

### DockerMutations

- `start` / `stop` / `restart` / `pause` / `unpause` / `removeContainer(id)`
- `updateContainer` / `updateContainers` / `updateAllContainers`
- `updateAutostartConfiguration`

### VmMutations

- `start` / `stop` / `pause` / `resume` / `forceStop` / `reboot` / `reset(id)`

## 结论

| 能力 | 是否支持 | 说明 |
|------|----------|------|
| 阵列启停 | ✅ | `array.setState(START/STOP)` |
| Parity 控制 | ✅ | `parityCheck.start/pause/resume/cancel` |
| Docker 控制 | ✅ | 前端 Containers 页已实现 |
| VM 控制 | ✅ | 前端 Containers 页已实现 |
| 磁盘手动休眠 | ❌ | API 无 spinDown/spinUp；只能走 SSH/webGui 宿主接口，违反「不动 unraid 宿主文件」红线 |

## 建议（后续迭代候选）

1. **Dashboard 加阵列启停按钮**：根据当前 `array.state` 显示启动/停止（mutation 已验证存在）。
2. **ParityCard 加控制按钮**：Running 时显示暂停/取消；Paused 时显示恢复/取消；未运行时显示开始（可选纠错模式）。
3. **磁盘休眠功能放弃**：unraid-api 不暴露该 mutation，宿主方案违反红线，不在 Dashboard 范围内。
