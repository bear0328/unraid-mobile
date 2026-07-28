// 【续 68】栈 → 有更新的容器匹配:GraphQL 容器列表带 isUpdateAvailable,
// 按 compose 默认命名(`<project>-<service>-<n>` v2 / `<project>_<service>_<n>` legacy)
// 归属到栈;任一容器有更新 → 栈显示「更新」徽章。
// 【续 70】后端在栈上带 containers 字段(docker label 精确归属)时优先精确成员
// 匹配 —— 自定义 container_name(如项目 ms-go / 容器 msgo)前缀启发式配不上。
// 旧版后端无此字段 → 回退启发式(降级,绝不误报)。
import type { ComposeStack } from '../../services/composeApi';
import type { UnraidDockerContainer } from '../../services';

export function computeStackUpdates(
  stacks: ComposeStack[],
  containers: UnraidDockerContainer[]
): Set<string> {
  const updatedNames = new Set(
    containers
      .filter((c) => c.isUpdateAvailable === true)
      .map((c) => c.name.toLowerCase())
  );
  const out = new Set<string>();
  for (const s of stacks) {
    if (s.containers) {
      // 精确匹配:label 归属列表与有更新的容器名求交
      if (s.containers.some((n) => updatedNames.has(n.toLowerCase()))) {
        out.add(s.name);
      }
      continue;
    }
    // 回退:前缀启发式(旧版后端)
    const p = s.project.toLowerCase();
    if ([...updatedNames].some((n) => n === p || n.startsWith(`${p}-`) || n.startsWith(`${p}_`))) {
      out.add(s.name);
    }
  }
  return out;
}
