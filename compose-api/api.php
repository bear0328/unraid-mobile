<?php

declare(strict_types=1);

/**
 * unraid-mobile Compose API(续 47 2026-07-19)
 *
 * 正本位置: /boot/config/plugins/unraid-mobile/api.php (flash 盘,持久,全 unRAID 路径统一)
 * 执行位置: /usr/local/emhttp/plugins/compose.manager/api.php
 *           — 宿主 php.ini 设 doc_root=/usr/local/emhttp,php-fpm 只执行 doc_root 内的脚本;
 *           该目录是 tmpfs,重启丢失,由 /boot/config/go 钩子从正本 cp 恢复
 *           (install-compose-api.sh 幂等安装以上全部)
 * 服务通道: unraid-mobile 容器 nginx /compose-api/ (fastcgi) → 宿主 php-fpm unix socket
 *           (/var/run/php-fpm.sock,root 运行) → 本文件。
 *           绕开 unRAID webGui 的会话认证(auth-request.php 不白名单任何插件端点)。
 *           注意 nginx 必须同时传匹配的 SCRIPT_NAME(doc_root 相对路径),否则 php-fpm
 *           按 doc_root+SCRIPT_NAME 解析,无视 SCRIPT_FILENAME,报 ENOENT。
 *
 * 鉴权: X-Api-Key header 与 /boot/config/plugins/unraid-mobile/apikey 比对
 *       (与 GraphQL 同一个密钥,app 端零额外配置;flash 盘 root 600,不在 web 服务路径)。
 *       【续 60】文件格式 `sha256:<hex>` = 存 key 的哈希,不明文存 key —— flash 备份/诊断包
 *       外泄不泄 key 本身;无前缀的旧明文格式自动兼容(重跑安装脚本即升级为哈希)。
 *
 * 端点:
 *   GET  ?action=cputemp                    CPU 温度(续 51:直读 /sys/class/hwmon CPU 传感器,
 *                                           纯内核 sysfs 不碰 smartctl/块设备,全盘 standby 不唤盘。
 *                                           这是续 46.5 "GraphQL temperature 唤盘红线"的安全替代)
 *   GET  ?action=list                       栈列表(名称/状态/autostart/last_result)
 *   GET  ?action=get&name=X                 栈详情(compose.yaml/override/log)
 *   GET  ?action=log&name=X                 操作日志 + 是否有异步任务在跑
 *   PUT  {action: up|down|restart, name}    同步执行(快操作) — Content-Type: application/json
 *   PUT  {action: pull|rebuild, name}       异步执行(慢操作,前端轮询 log)
 *   PUT  {action: autostart, name, value}   value = "true"|"false"
 *   PUT  ?name=X   body=compose.yaml 内容    tmp+校验+rename 原子写入,失败原文件不动(留 bak 双保险)
 *
 * 注意: 写操作必须用 PUT 不能用 POST — php.ini auto_prepend_file(local_prepend.php)
 *       对所有 POST 强制 webGui CSRF 校验,无 token 静默 exit(空 200);PUT 不受检查。
 */

const PROJECTS_DIR = '/boot/config/plugins/compose.manager/projects';
// 【续 49.2 2026-07-19】key 文件挪到 flash 盘统一路径 — 消灭最后一个 per-user 路径
// (appdata 目录名因用户/容器名而异,/boot/config 全 unRAID 一致,api.php 由此零参数化)
const KEY_FILE = '/boot/config/plugins/unraid-mobile/apikey';
const LOG_TAIL_BYTES = 65536;
const DOCKER = '/usr/bin/docker';
const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
// 【续 50 D3-3】审计日志:敏感动作成败各一行;超过 1MB 轮转为 .old(只留一代,简单)
const AUDIT_LOG = '/boot/config/plugins/unraid-mobile/audit.log';
const AUDIT_MAX_BYTES = 1048576;

header('Content-Type: application/json; charset=utf-8');

function ok(mixed $data): void
{
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $code, string $msg): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- 鉴权 ----------
$stored = trim((string) @file_get_contents(KEY_FILE));
if ($stored === '') {
    fail(503, 'compose API 未配置: key 文件缺失,请运行 install-compose-api.sh');
}
$provided = $_SERVER['HTTP_X_API_KEY'] ?? '';
if (!is_string($provided) || $provided === '') {
    fail(401, '未授权: X-Api-Key 无效');
}
// 【续 60】文件格式自描述前缀: `sha256:<64hex>` = 哈希存储(新装),否则 = 旧明文(兼容)。
// 不能用内容嗅探(unRAID key 本身就是 64 hex,会误判);比对必须是 stored vs hash(provided)。
// unRAID API key 本身是高熵随机串,无盐快哈希即可(无彩虹表/爆破场景)。
if (str_starts_with($stored, 'sha256:')) {
    $ok = hash_equals(substr($stored, 7), hash('sha256', $provided));
} else {
    $ok = hash_equals($stored, $provided);
}
if (!$ok) {
    fail(401, '未授权: X-Api-Key 无效');
}

// ---------- 工具 ----------

// 【续 50 D3-3】审计日志:每个敏感动作成功/失败各追加一行(fail()/ok() 会 exit,须先审计)
function audit(string $action, string $stack, string $result): void
{
    $size = @filesize(AUDIT_LOG);
    if ($size !== false && $size > AUDIT_MAX_BYTES) {
        @rename(AUDIT_LOG, AUDIT_LOG . '.old');
    }
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '-');
    $line = sprintf("[%s] action=%s stack=%s result=%s ip=%s\n", date('c'), $action, $stack, $result, $ip);
    @file_put_contents(AUDIT_LOG, $line, FILE_APPEND | LOCK_EX);
}

/** 校验栈名(防路径穿越)并确认目录存在 */
function validName(mixed $name): string
{
    $name = (string) $name;
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/', $name)) {
        fail(400, '非法栈名');
    }
    if (!is_dir(PROJECTS_DIR . '/' . $name)) {
        fail(404, '栈不存在: ' . $name);
    }
    return $name;
}

/** docker compose 项目名归一化(目录名 → 小写、去非法字符),与 compose ls 的 Name 对应 */
function projectName(string $dirName): string
{
    return (string) preg_replace('/[^a-z0-9_-]/', '', strtolower($dirName));
}

function composeFileCandidates(): array
{
    return ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
}

function overrideFileCandidates(): array
{
    return [
        'compose.override.yaml',
        'compose.override.yml',
        'docker-compose.override.yaml',
        'docker-compose.override.yml',
    ];
}

/** 返回目录下第一个存在的候选文件名,没有则 null */
function firstExisting(string $dir, array $candidates): ?string
{
    foreach ($candidates as $c) {
        if (is_file($dir . '/' . $c)) {
            return $c;
        }
    }
    return null;
}

/** `docker compose ls` 的 project => row 映射(只取正在运行/退出的栈) */
function composeLsMap(): array
{
    $out = shell_exec(PATH_ENV . ' ' . DOCKER . ' compose ls --format json 2>/dev/null');
    $map = [];
    $rows = json_decode((string) $out, true);
    if (is_array($rows)) {
        foreach ($rows as $row) {
            if (isset($row['Name'])) {
                $map[(string) $row['Name']] = $row;
            }
        }
    }
    return $map;
}

function readJsonFile(string $path): ?array
{
    $data = json_decode((string) @file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function tailFile(string $path): string
{
    $size = @filesize($path);
    if ($size === false) {
        return '';
    }
    $fh = fopen($path, 'rb');
    if ($fh === false) {
        return '';
    }
    if ($size > LOG_TAIL_BYTES) {
        fseek($fh, -LOG_TAIL_BYTES, SEEK_END);
    }
    $content = (string) stream_get_contents($fh);
    fclose($fh);
    return $content;
}

function readAutostart(string $dir): bool
{
    return trim((string) @file_get_contents($dir . '/autostart')) === 'true';
}

/**
 * 【续 51 2026-07-19】读 CPU 温度:直读 /sys/class/hwmon 的 CPU 传感器 hwmon。
 * 纯内核 sysfs 文件读取,不执行任何外部命令、不触碰块设备,全盘 standby 下不会唤盘
 * (续 46.5 实锤 GraphQL metrics.temperature 会触发 unraid-api 跑 smartctl 全扫唤盘,
 *  故前端温度改走这里;该红线依旧有效,勿恢复 GraphQL temperature 查询)。
 *
 * 返回 ['celsius' => float|null, 'sensor' => string|null];无 CPU 传感器时两者皆 null。
 */
function readCpuTemp(): array
{
    // CPU 传感器白名单:coretemp(Intel)/k10temp+zenpower(AMD)/cpu_thermal(ARM)。
    // 排除 nvme(盘温,且读盘温接口有唤盘风险)、acpitz(主板)、it87 等 Super-IO(含义不确定)。
    $cpuSensorNames = ['coretemp', 'k10temp', 'zenpower', 'cpu_thermal'];
    // 优先的 label:整包温度
    $preferredLabels = ['package id 0', 'tctl', 'tdie'];

    foreach (glob('/sys/class/hwmon/hwmon*') ?: [] as $hwmon) {
        $name = trim((string) @file_get_contents($hwmon . '/name'));
        if (!in_array($name, $cpuSensorNames, true)) {
            continue;
        }
        $temps = []; // label(小写) => 毫度
        foreach (glob($hwmon . '/temp*_input') ?: [] as $input) {
            $raw = trim((string) @file_get_contents($input));
            if (!is_numeric($raw)) {
                continue;
            }
            $labelFile = preg_replace('/_input$/', '_label', $input);
            $label = strtolower(trim((string) @file_get_contents((string) $labelFile)));
            $temps[$label !== '' ? $label : basename($input)] = (int) $raw;
        }
        if ($temps === []) {
            continue;
        }
        foreach ($preferredLabels as $want) {
            if (isset($temps[$want])) {
                return ['celsius' => round($temps[$want] / 1000, 1), 'sensor' => $name . '/' . $want];
            }
        }
        // 无整包 label(如部分 k10temp 只有单值):取最大值
        $max = max($temps);
        return ['celsius' => round($max / 1000, 1), 'sensor' => $name . '/max'];
    }
    return ['celsius' => null, 'sensor' => null];
}

function stackSummary(string $dirName, array $lsMap): array
{
    $dir = PROJECTS_DIR . '/' . $dirName;
    $project = projectName($dirName);
    $row = $lsMap[$project] ?? null;
    $status = $row['Status'] ?? null; // 例: "running(1)" / "exited(0)"
    return [
        'name' => $dirName,
        'project' => $project,
        'status' => $status,
        'running' => is_string($status) && str_starts_with($status, 'running'),
        'autostart' => readAutostart($dir),
        'lastResult' => readJsonFile($dir . '/last_result.json'),
        'composeFile' => firstExisting($dir, composeFileCandidates()),
    ];
}

/**
 * 同步执行 docker compose 子命令,输出落 last_cmd.log,结果落 last_result.json
 * (与 compose.manager 插件的文件约定保持一致,插件 UI 里也能看到)
 */
function runComposeSync(string $dir, string $op, string $args): array
{
    set_time_limit(300);
    $cmd = sprintf('cd %s && %s %s compose %s 2>&1', escapeshellarg($dir), PATH_ENV, DOCKER, $args);
    $lines = [];
    $exitCode = 1;
    exec($cmd, $lines, $exitCode);
    $output = implode("\n", $lines);
    file_put_contents($dir . '/last_cmd.log', $output);
    $result = [
        'result' => $exitCode === 0 ? 'success' : 'error',
        'exit_code' => $exitCode,
        'operation' => $op,
        'timestamp' => date('c'),
    ];
    file_put_contents($dir . '/last_result.json', json_encode($result));
    return [$exitCode, $output];
}

/**
 * 异步执行(慢操作):nohup 后台跑,.op-running 标记文件存在 = 任务进行中,
 * 前端轮询 ?action=log 看进度。
 */
function runComposeAsync(string $dir, string $op, string $args): void
{
    // 【续 50 D3-2】锁改用 fopen 'x' 原子创建(原 file_exists+写是 TOCTOU,并发会双开 compose)
    $lockFile = $dir . '/.op-running';
    $lock = @fopen($lockFile, 'x');
    if ($lock === false) {
        audit($op, basename($dir), 'fail');
        fail(409, '该栈有操作正在进行中,请等待完成');
    }
    fwrite($lock, $op);
    fclose($lock);
    // 【续 50 D3-3】异步动作的真实成败在后台 shell 里,完成时把审计行追加进 AUDIT_LOG
    $inner = sprintf(
        'cd %s && %s %s compose %s > last_cmd.log 2>&1; ec=$?; '
        . 'printf \'{"result":"%%s","exit_code":%%d,"operation":"%s","timestamp":"%%s"}\' '
        . '"$([ "$ec" -eq 0 ] && echo success || echo error)" "$ec" "$(date \'+%%Y-%%m-%%dT%%H:%%M:%%S%%z\')" '
        . '> last_result.json; '
        . 'printf \'[%%s] action=%s stack=%s result=%%s ip=%s\n\' "$(date -Iseconds)" '
        . '"$([ "$ec" -eq 0 ] && echo ok || echo fail)" >> %s; '
        . 'rm -f .op-running',
        escapeshellarg($dir),
        PATH_ENV,
        DOCKER,
        $args,
        $op,
        $op,
        basename($dir),
        escapeshellarg((string) ($_SERVER['REMOTE_ADDR'] ?? '-')),
        escapeshellarg(AUDIT_LOG)
    );
    exec('nohup sh -c ' . escapeshellarg($inner) . ' > /dev/null 2>&1 &');
}

// ---------- 路由 ----------

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $action = (string) ($_GET['action'] ?? '');

    // 【续 51】CPU 温度(sysfs,不唤盘),放在栈相关 action 之前(不需要 PROJECTS_DIR)
    if ($action === 'cputemp') {
        ok(readCpuTemp());
    }

    if ($action === 'list') {
        $names = [];
        foreach (scandir(PROJECTS_DIR) ?: [] as $entry) {
            if ($entry !== '.' && $entry !== '..' && is_dir(PROJECTS_DIR . '/' . $entry)) {
                $names[] = $entry;
            }
        }
        sort($names, SORT_NATURAL | SORT_FLAG_CASE);
        $lsMap = composeLsMap();
        ok(array_map(fn($n) => stackSummary($n, $lsMap), $names));
    }

    if ($action === 'get') {
        $name = validName($_GET['name'] ?? '');
        $dir = PROJECTS_DIR . '/' . $name;
        $composeFile = firstExisting($dir, composeFileCandidates());
        $overrideFile = firstExisting($dir, overrideFileCandidates());
        ok([
            'stack' => stackSummary($name, composeLsMap()),
            'composeYaml' => $composeFile !== null ? (string) file_get_contents($dir . '/' . $composeFile) : '',
            'overrideYaml' => $overrideFile !== null ? (string) file_get_contents($dir . '/' . $overrideFile) : null,
            'lastCmdLog' => tailFile($dir . '/last_cmd.log'),
            'opRunning' => file_exists($dir . '/.op-running'),
        ]);
    }

    if ($action === 'log') {
        $name = validName($_GET['name'] ?? '');
        $dir = PROJECTS_DIR . '/' . $name;
        ok([
            'log' => tailFile($dir . '/last_cmd.log'),
            'running' => file_exists($dir . '/.op-running'),
        ]);
    }

    fail(400, '未知 action: ' . $action);
}

if ($method === 'POST') {
    // 【排障 2026-07-19】POST 走不通:php.ini auto_prepend_file=local_prepend.php
    // 对 POST 强制 CSRF 校验(除 /login.php /auth-request.php),无 token 静默 exit(空 200)。
    // 该 prepend 是 webGui 的系统文件不能改,故本 API 的写操作全部走 PUT(不受 CSRF 检查),
    // 由本文件自有的 X-Api-Key 鉴权兜底。POST 保留此分支仅作显式报错。
    fail(405, 'POST 不受支持(webGui CSRF prepend 拦截),请用 PUT');
}

// 写操作统一走 PUT:
//   Content-Type: application/json → JSON 指令(action 分发)
//   其他 Content-Type → 视为 compose.yaml 原文保存
if ($method === 'PUT' && str_contains((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body)) {
        fail(400, '请求体必须是 JSON');
    }
    $action = (string) ($body['action'] ?? '');

    if ($action === 'autostart') {
        $name = validName($body['name'] ?? '');
        $value = (string) ($body['value'] ?? '');
        if ($value !== 'true' && $value !== 'false') {
            fail(400, 'value 必须是 "true" 或 "false"');
        }
        $dir = PROJECTS_DIR . '/' . $name;
        if (file_put_contents($dir . '/autostart', $value) === false) {
            audit('autostart', $name, 'fail');
            fail(500, 'autostart 写入失败');
        }
        audit('autostart', $name, 'ok');
        ok(['autostart' => $value === 'true']);
    }

    // 固定子命令白名单,参数不外传(无注入面)
    $syncOps = ['up' => 'up -d', 'down' => 'down', 'restart' => 'restart'];
    $asyncOps = ['pull' => 'pull', 'rebuild' => 'up -d --build --force-recreate'];

    if (isset($syncOps[$action])) {
        $name = validName($body['name'] ?? '');
        $dir = PROJECTS_DIR . '/' . $name;
        [$exitCode, $output] = runComposeSync($dir, $action, $syncOps[$action]);
        // 【续 50 D3-3】同步动作按退出码记成败
        audit($action, $name, $exitCode === 0 ? 'ok' : 'fail');
        ok([
            'exitCode' => $exitCode,
            'output' => $output,
            'running' => composeLsMap()[projectName($name)]['Status'] ?? null,
        ]);
    }

    if (isset($asyncOps[$action])) {
        $name = validName($body['name'] ?? '');
        runComposeAsync(PROJECTS_DIR . '/' . $name, $action, $asyncOps[$action]);
        ok(['async' => true]);
    }

    fail(400, '未知 action: ' . $action);
}

if ($method === 'PUT') {
    $name = validName($_GET['name'] ?? '');
    $dir = PROJECTS_DIR . '/' . $name;
    $yaml = (string) file_get_contents('php://input');
    if (trim($yaml) === '' || !str_contains($yaml, 'services:')) {
        fail(400, 'compose.yaml 内容无效(为空或缺少 services:)');
    }

    $composeFile = firstExisting($dir, composeFileCandidates()) ?? 'compose.yaml';
    $target = $dir . '/' . $composeFile;
    $backup = $target . '.unraid-mobile.bak';
    if (is_file($target) && @copy($target, $backup) === false) {
        audit('yaml-write', $name, 'fail');
        fail(500, '备份原文件失败,已中止写入');
    }
    // 【续 50 D3-1】原子写入:先写同目录 .tmp → 校验 tmp → rename 原子替换;
    // 校验失败删 tmp,原文件全程不被触碰(不再有读到半截坏文件的窗口),bak 保留作双保险
    $tmp = $target . '.tmp';
    if (file_put_contents($tmp, $yaml) === false) {
        audit('yaml-write', $name, 'fail');
        fail(500, 'compose.yaml 临时文件写入失败');
    }

    // 校验 tmp:显式 -f 指向 tmp 文件(有 override 时一并带上,与默认合并行为一致)
    set_time_limit(60);
    $checkArgs = '-f ' . escapeshellarg($composeFile . '.tmp');
    $overrideFile = firstExisting($dir, overrideFileCandidates());
    if ($overrideFile !== null) {
        $checkArgs .= ' -f ' . escapeshellarg($overrideFile);
    }
    $checkCmd = sprintf(
        'cd %s && %s %s compose %s config -q 2>&1',
        escapeshellarg($dir),
        PATH_ENV,
        DOCKER,
        $checkArgs
    );
    $checkOut = [];
    $checkCode = 1;
    exec($checkCmd, $checkOut, $checkCode);
    if ($checkCode !== 0) {
        @unlink($tmp);
        audit('yaml-write', $name, 'fail');
        fail(422, 'compose 校验失败,原文件未改动: ' . implode('; ', array_slice($checkOut, 0, 5)));
    }
    if (!@rename($tmp, $target)) {
        @unlink($tmp);
        audit('yaml-write', $name, 'fail');
        fail(500, 'compose.yaml 原子替换失败(原文件未改动)');
    }
    @unlink($backup);
    audit('yaml-write', $name, 'ok');
    ok(['saved' => true, 'file' => $composeFile]);
}

fail(405, 'Method Not Allowed');
