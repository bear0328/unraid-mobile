// 【续 55 商业化 2026-07-19】设置页 License 区
// 输入 key 激活 Pro / 显示激活状态(邮箱、到期)/ 解除绑定
// 【续 59 2026-07-22】激活链路加:服务器绑定检查(flashGuid)+ 设备注册(上限 maxDev);
//   状态区显示绑定 GUID/设备数;解绑时从服务器设备文件删除本机(释放名额)
import { useState } from 'react';
import { useSyncExternalStore } from 'react';
import {
  activateLicense,
  clearLicense,
  getLicenseState,
  subscribeLicense,
} from '../services/license';
import { checkServerBinding, registerDevice, unregisterDevice } from '../services/licenseBinding';
import { useToast } from '../hooks/useToast';

export default function LicenseSection() {
  const state = useSyncExternalStore(subscribeLicense, getLicenseState);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<{ count: number; maxDev: number } | null>(null);
  const toast = useToast();

  const handleActivate = async () => {
    if (!key.trim()) return;
    setBusy(true);
    // 【续 59】顺序:验签落盘 → 绑机检查 → 设备注册;任一不过则回滚
    const r = await activateLicense(key);
    if (!r.ok) {
      setBusy(false);
      toast.error(r.error || '激活失败');
      return;
    }
    const bound = await checkServerBinding();
    if (!bound) {
      setBusy(false);
      toast.error('此 key 绑定的是另一台 unRAID 服务器(flashGuid 不匹配),无法在本机使用');
      return;
    }
    const st = getLicenseState();
    if (st.status === 'active') {
      const reg = await registerDevice(st.info);
      if (!reg.ok) {
        // 设备超限:回滚激活
        clearLicense();
        setBusy(false);
        toast.error(reg.error || '设备数超限');
        return;
      }
      if (reg.count && reg.maxDev) setDeviceInfo({ count: reg.count, maxDev: reg.maxDev });
    }
    setBusy(false);
    setKey('');
    toast.success('Pro 已激活 🎉');
  };

  const handleUnbind = () => {
    unregisterDevice(); // 【续 59】释放服务器侧设备名额(尽力而为,失败无碍)
    clearLicense();
    setDeviceInfo(null);
    toast.info('已解除绑定,已回到免费版');
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
          {(state.info.guid || deviceInfo) && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {state.info.guid && <>绑定服务器: {state.info.guid.slice(0, 8)}… </>}
              {deviceInfo && (
                <>
                  设备: {deviceInfo.count}/{deviceInfo.maxDev}
                </>
              )}
            </p>
          )}
          <button
            onClick={handleUnbind}
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
            {state.status === 'mismatch' && (
              <span className="block mt-1 text-red-500">
                ⚠️ 已存的 key 绑定另一台 unRAID 服务器({state.info.email}),本机 Pro 不可用。
              </span>
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
