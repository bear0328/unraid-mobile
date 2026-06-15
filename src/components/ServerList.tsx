// 【阶段 P2-多服务器 - 2026-06-17 续 33-10】Settings 页面:服务器列表管理
// 展示 / 添加 / 编辑 / 删除 / 激活
// LS 存储(Server[]) + 同步旧格式 LS 兼容 getApiConfig()
import { useEffect, useState } from 'react';
import {
  getServers,
  getActiveServer,
  addServer,
  updateServer,
  removeServer,
  setActiveServer,
  subscribeServersChange,
  type Server,
} from '../services/unraidApi/config';
import { useToast } from '../hooks/useToast';
import { usePro } from '../hooks/usePro';
import { ProGateButton } from './ProGate';

const COLOR_OPTIONS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

interface EditState {
  id: string | null; // null = 新增
  name: string;
  serverUrl: string;
  apiKey: string;
  color: string;
}

const EMPTY_EDIT: EditState = {
  id: null,
  name: '',
  serverUrl: '',
  apiKey: '',
  color: COLOR_OPTIONS[0],
};

export default function ServerList() {
  const [servers, setServers] = useState<Server[]>([]);
  const [active, setActive] = useState<Server | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const toast = useToast();
  // 【续 55 商业化】多服务器 → Pro:免费版限 1 台,已有 1 台再点"添加"换 🔒 引导
  // (已有 ≥2 台的免费用户不强制删除,只是不能再加)
  const pro = usePro();
  const addLocked = !pro && servers.length >= 1;

  useEffect(() => {
    const refresh = () => {
      setServers(getServers());
      setActive(getActiveServer());
    };
    refresh();
    return subscribeServersChange(refresh);
  }, []);

  function handleSave() {
    if (!editing) return;
    if (!editing.name.trim() || !editing.serverUrl.trim()) {
      toast.error('名称和服务器地址不能为空');
      return;
    }
    const cleanUrl = editing.serverUrl.replace(/\/+$/, '');
    if (editing.id) {
      updateServer(editing.id, {
        name: editing.name.trim(),
        serverUrl: cleanUrl,
        color: editing.color,
        apiKey: editing.apiKey.trim() || undefined,
      });
      toast.success('已更新');
    } else {
      if (!editing.apiKey.trim()) {
        toast.error('新增服务器需要 API 密钥');
        return;
      }
      addServer({
        name: editing.name.trim(),
        serverUrl: cleanUrl,
        color: editing.color,
        apiKey: editing.apiKey.trim(),
      });
      toast.success('已添加');
    }
    setEditing(null);
  }

  function handleEdit(srv: Server) {
    setEditing({
      id: srv.id,
      name: srv.name,
      serverUrl: srv.serverUrl,
      apiKey: '',
      color: srv.color || COLOR_OPTIONS[0],
    });
  }

  function handleRemove(srv: Server) {
    if (!confirm(`确定删除「${srv.name}」?`)) return;
    removeServer(srv.id);
    toast.success('已删除');
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          🖥️ 服务器列表
          {servers.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
              {servers.length}
            </span>
          )}
        </h3>
        {addLocked ? (
          <ProGateButton
            label="添加"
            className="text-xs px-2.5 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
          />
        ) : (
          <button
            onClick={() => setEditing({ ...EMPTY_EDIT })}
            className="text-xs px-2.5 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
          >
            ➕ 添加
          </button>
        )}
      </div>

      {servers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          暂无配置。可添加多台 unRAID,顶栏快速切换。
        </p>
      ) : (
        <div className="space-y-2">
          {servers.map((srv) => {
            const isActive = srv.id === active?.id;
            return (
              <div
                key={srv.id}
                className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700'
                    : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: srv.color || '#3b82f6' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{srv.name}</span>
                    {isActive && (
                      <span className="text-[10px] text-primary-600 dark:text-primary-400 font-medium">
                        当前
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                    {srv.serverUrl}
                  </div>
                </div>
                {!isActive && (
                  <button
                    onClick={() => {
                      setActiveServer(srv.id);
                      toast.success(`已切换到 ${srv.name}`);
                    }}
                    className="text-xs px-2 py-1 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded"
                  >
                    激活
                  </button>
                )}
                <button
                  onClick={() => handleEdit(srv)}
                  className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                  aria-label={`编辑 ${srv.name}`}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleRemove(srv)}
                  className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  aria-label={`删除 ${srv.name}`}
                >
                  🗑
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 编辑/新增 modal-lite */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-5 space-y-3">
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">
              {editing.id ? '编辑服务器' : '添加服务器'}
            </h4>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">名称</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="如:客厅 NAS"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                服务器地址
              </label>
              <input
                value={editing.serverUrl}
                onChange={(e) => setEditing({ ...editing, serverUrl: e.target.value })}
                placeholder="http://192.168.1.100"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                API 密钥 {editing.id && <span className="text-gray-400">(留空保留原密钥)</span>}
              </label>
              <input
                type="password"
                value={editing.apiKey}
                onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                placeholder={editing.id ? '••••••••' : '从 unRAID Connect 页面获取'}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">颜色</label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditing({ ...editing, color: c })}
                    className={`w-7 h-7 rounded-full transition-transform ${editing.color === c ? 'ring-2 ring-offset-2 ring-primary-500 scale-110' : ''}`}
                    style={{ backgroundColor: c }}
                    aria-label={`颜色 ${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditing(null)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
