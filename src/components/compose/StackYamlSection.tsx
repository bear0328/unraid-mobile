// 【续 78】从 StackDetailModal.tsx 拆出(纯结构移动,不改行为)
// compose.yaml 查看/编辑区块(默认折叠,点标题展开;保存后端校验失败自动回滚)
import { useCallback, useState } from 'react';
import { Pencil, Save, ChevronRight, ChevronDown } from 'lucide-react';
import Icon from '../ui/Icon';
import { useToast } from '../../hooks/useToast';
import { saveComposeYaml } from '../../services/composeApi';

interface StackYamlSectionProps {
  stackName: string;
  composeYaml: string;
  overrideYaml: string | null;
  /** 保存成功后通知父级重载栈详情 */
  onSaved: () => void;
}

export default function StackYamlSection({
  stackName,
  composeYaml,
  overrideYaml,
  onSaved,
}: StackYamlSectionProps) {
  // 【续 68.1】compose.yaml 默认折叠(日志对用户更有用,挪到上面;yaml 按需展开)
  const [yamlOpen, setYamlOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editYaml, setEditYaml] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveComposeYaml(stackName, editYaml);
      toast.success('compose.yaml 已保存(校验通过)');
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [stackName, saving, editYaml, onSaved, toast]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setYamlOpen(!yamlOpen)}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white"
          aria-expanded={yamlOpen}
        >
          <Icon icon={yamlOpen ? ChevronDown : ChevronRight} size={14} />
          compose.yaml
        </button>
        {yamlOpen &&
          (!editing ? (
            <button
              onClick={() => {
                setEditYaml(composeYaml);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <Icon icon={Pencil} size={12} />
              编辑
            </button>
          ) : (
            <div className="flex gap-1.5">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  '保存中…'
                ) : (
                  <>
                    <Icon icon={Save} size={12} />
                    保存
                  </>
                )}
              </button>
            </div>
          ))}
      </div>
      {yamlOpen &&
        (editing ? (
          <textarea
            value={editYaml}
            onChange={(e) => setEditYaml(e.target.value)}
            spellCheck={false}
            className="w-full h-56 font-mono text-xs p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="编辑 compose.yaml"
          />
        ) : (
          <pre className="max-h-48 overflow-auto font-mono text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
            {composeYaml || '(空)'}
          </pre>
        ))}
      {yamlOpen && overrideYaml && !editing && (
        <details className="mt-1.5">
          <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            override 文件
          </summary>
          <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
            {overrideYaml}
          </pre>
        </details>
      )}
    </div>
  );
}
