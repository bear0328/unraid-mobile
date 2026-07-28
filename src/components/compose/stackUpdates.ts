// 【续 68】栈 → 有更新的容器匹配:GraphQL 容器列表带 isUpdateAvailable,
// 按 compose 默认命名(`<project>-<service>-<n>` v2 / `<project>_<service>_<n>` legacy)
// 归属到栈;任一容器有更新 → 栈显示「更新」徽章。
// 自定义 container_name 匹配不上 → 只是不显示徽章(降级,绝不误报)。
import type { ComposeStack } from '../../services/composeApi';
import type { UnraidDockerContainer } from '../../services';

export function computeStackUpdates(
  stacks: ComposeStack[],
  containers: UnraidDockerContainer[]
): Set<string> {
  const updatedNames = containers
    .filter((c) => c.isUpdateAvailable === true)
    .map((c) => c.name.toLowerCase());
  const out = new Set<string>();
  for (const s of stacks) {
    const p = s.project.toLowerCase();
    if (updatedNames.some((n) => n === p || n.startsWith(`${p}-`) || n.startsWith(`${p}_`))) {
      out.add(s.name);
    }
  }
  return out;
}
