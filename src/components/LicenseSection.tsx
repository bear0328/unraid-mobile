// 【续 55 商业化 2026-07-19】设置页 License 区
// 输入 key 激活 Pro / 显示激活状态(邮箱、到期)/ 解除绑定
import { useState } from 'react';
import { useSyncExternalStore } from 'react';
import {
  activateLicense,
  clearLicense,
  getLicenseState,
  subscribeLicense,
} from '../services/license';
import { useToast } from '../hooks/useToast';

export default function LicenseSection() {
  const state = useSyncExternalStore(subscribeLicense, getLicenseState);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const handleActivate = async () => {
    if (!key.trim()) return;
    setBusy(true);
    const r = await activateLicense(key);
    setBusy(false);
    if (r.ok) {
      setKey('');
      toast.success('Pro 已激活 🎉');
    } else {
      toast.error(r.error || '激活失败');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm" id="license-section">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        🔑 License
      </h3>

      {state.status === 'active' ? (
        <div className="space-y-2">
          <p className="text-sm text-green-600 dark:text-green-400">
            ✓ Pro 已激活:{state.info.email}
            {state.info.exp
              ? `(有效期至 ${new Date(state.info.exp * 1000).toISOString().slice(0, 10)})`
              : '(永久)'}
          </p>
          <button
            onClick={() => {
              clearLicense();
              toast.info('已解除绑定,已回到免费版');
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            解除绑定
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            当前为免费版。输入 License key 解锁 Pro 功能(容器详情/日志、Compose 管理、
            文件写操作、批量操作、多服务器、告警通知等)。
            {state.status === 'expired' && (
              <span className="block mt-1 text-red-500">
                ⚠️ 已绑定的 key 过期({state.info.email}),请续期或重新输入。
              </span>
            )}
            {state.status === 'invalid' && (
              <span className="block mt-1 text-red-500">⚠️ 已存的 key 无效,请重新输入。</span>
            )}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="UMPRO1.xxxx.yyyy"
              className="flex-1 px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-600
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              aria-label="License key"
            />
            <button
              onClick={handleActivate}
              disabled={busy || !key.trim()}
              className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg"
            >
              {busy ? '验证中...' : '激活'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
