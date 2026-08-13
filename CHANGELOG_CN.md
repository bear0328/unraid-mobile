# 更新日志

本文件记录项目的所有重要变更,格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [1.2.2] - 2026-08-14

### 优化

- Dashboard 卡片排序:上移/下移按钮收进手柄弹出菜单,常态只显示拖动手柄(100px → 36px),不再遮挡卡片标题;键盘方向键与 32px 触控面积保留
- Dashboard 拖拽预览:拖动卡片时跟手预览改为正常大小的半透明整卡(圆角+阴影),不再是浏览器默认的小手柄快照「小白框」

### 修复

- 排序控件在 iOS 点按后不再残留半透明背景(粘性 `:hover`);改为 active 即时反馈 + 键盘焦点环
- 告警弹层「去 WebUI 查看」在 iOS PWA 打开空白页(JS `window.open` 在 PWA 不可靠,且深链需要 webGui 登录态)—— 所有 WebUI 入口统一改为真实 `<a target="_blank">` 链接跳 `{serverUrl}/login`
- 文档:README 截图占位替换为实际应用截图

## [1.2.1] - 2026-08-10

### 修复

- Shares 文件管理:`#` 文件名被 URL fragment 截断;中文重命名/移动/拷贝失败(MOVE/COPY 的 `Destination` 头非 ASCII 抛错)—— DAV 路径在所有出口统一编码
- Shares 根目录手动刷新在 30 分钟缓存窗口内无效(刷新前先失效对应缓存命名空间)
- Shares 大文件下载/预览被 15 秒默认 DAV 超时误伤(整文件读取延长至 120 秒)
- Shares 分享链接双重编码导致中文路径 404
- Safari 下文件列表日期解析可能产出 NaN(autoindex 日期不再依赖 `Date.parse` 的本地化行为)
- 设置页:服务器地址协议后带空格/缺协议/格式非法时原样保存导致异常 —— 所有保存路径统一归一化与校验
- 设置页「关于」版本号长期写死;改为构建期从 `package.json` 注入
- `release.sh` 发版时同步 `package.json` 的 version 字段

### 已知限制

- 多服务器切换只更换 API 密钥;数据请求仍走当前容器的同源代理(即部署本容器的这台 unRAID)。单服务器使用不受影响。

## [1.2.0] - 2026-08-09

### 新增

- VM 增强详情(CPU/内存/磁盘/网络/直通/快照,读取 libvirt XML)
- Dashboard 告警铃铛本地告警列表(unRAID 通知可在应用内查看)

### 修复

- PWA 缓存根治:Service Worker 按构建 hash 版本化 + no-cache 头 + 更新后自动刷新 —— iOS PWA 不再卡在旧 bundle
- Dashboard 修复:手动刷新缓存失效口径、趋势图标签、阵列使用率按容量加权、收藏触控面积、错误 banner 重试按钮
- 容器页签修复:刷新按钮禁用态、缓存失效口径统一、VM 深链高亮滚动
