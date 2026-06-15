// GraphQL 查询字符串常量
// 【性能优化 2026-06-14】裁剪未使用字段，参考 DEV_PROGRESS.md "6-14 12:50-12:55 graphql 字段裁剪"
//
// 【续 46.5 2026-07-19 红线】SYSTEM_INFO_QUERY 禁止加 metrics.temperature 任何子字段:
// 全盘 standby 下查 temperature.sensors 会触发 unraid-api 跑 smartctl --scan + smartctl -j -a
// (无 -n standby),4 块机械盘全醒(wakeprobe 实测 + smartctl 进程实锤)。续 46 加的 sensors
// 当时"0→0 不唤盘"结论是在盘已醒时测的,掩盖了 standby 路径。CPU 温度因此永久禁用。
// 【续 51 2026-07-19】CPU 温度已改由 compose-api ?action=cputemp 提供(后端直读
// /sys/class/hwmon,不唤盘);本红线依旧有效,勿恢复 GraphQL temperature 查询。

export const SYSTEM_INFO_QUERY = `
  query {
    info {
      cpu {
        cores
        threads
        brand
      }
      os {
        hostname
        uptime
      }
    }
    metrics {
      cpu {
        percentTotal
        cpus {
          percentUser
          percentSystem
        }
      }
      memory {
        used
        total
        free
        percentTotal
        swapTotal
        swapUsed
        percentSwapTotal
      }
    }
    array {
      state
    }
  }
`;

// 【续 50 C9b】DISKS_QUERY 不再查 capacity:真实 schema 的 array.capacity 是
// ArrayCapacity { kilobytes, disks: Capacity(磁盘数量聚合) },无 per-disk name/cache,
// diskApi 原 capacity 查找分支是死代码已删;per-disk size/used 走 size/fsUsed(KB)换算
export const DISKS_QUERY = `
  query {
    array {
      disks {
        name
        device
        type
        status
        size
        temp
        fsSize
        fsUsed
        fsFree
        numReads
        numWrites
      }
      caches {
        name
        device
        status
        size
        temp
        fsSize
        fsUsed
        fsFree
        numReads
        numWrites
      }
      boot {
        name
        device
        status
        size
        temp
        fsSize
        fsUsed
        fsFree
        numReads
        numWrites
      }
    }
  }
`;

export const DOCKER_CONTAINERS_QUERY = `
  query {
    docker {
      containers {
        id
        names
        image
        state
        status
        autoStart
        created
      }
    }
  }
`;

// 【续 52 2026-07-19】详情弹窗全量静态信息查询(端口/命令/挂载/网络/磁盘占用/链接)。
// 列表查询(DOCKER_CONTAINERS_QUERY)保持轻量,这些重字段按需拉。
// 注意 size* 字段只有 list 形态有值;docker.container(id:) 单查实测返回 null,勿改单查。
export const DOCKER_CONTAINER_DETAILS_QUERY = `
  query {
    docker {
      containers {
        id
        names
        image
        state
        status
        autoStart
        autoStartOrder
        autoStartWait
        created
        command
        ports {
          ip
          privatePort
          publicPort
          type
        }
        lanIpPorts
        mounts
        networkSettings
        hostConfig {
          networkMode
        }
        sizeRootFs
        sizeRw
        sizeLog
        webUiUrl
        projectUrl
        supportUrl
        isUpdateAvailable
      }
    }
  }
`;

// 【续 50 B8】加 $since 参数:unraid-api(v4.35 已核实)logs(id, tail, since),
// 返回的 cursor 是"上批最后一行的时间戳",回传 since 即只取增量(官方注释:
// "Cursor that can be passed back through the since argument to continue streaming logs.")
export const DOCKER_LOGS_QUERY = `
  query GetContainerLogs($id: PrefixedID!, $tail: Int, $since: DateTime) {
    docker {
      logs(id: $id, tail: $tail, since: $since) {
        lines {
          timestamp
          message
        }
        cursor
      }
    }
  }
`;

export const VMS_QUERY = `
  query {
    vms {
      id
      domains {
        id
        name
        state
      }
    }
  }
`;

export const VM_DETAILS_QUERY = `
  query {
    vms {
      domains {
        name
        uuid
        state
      }
    }
  }
`;

export const SHARES_QUERY = `
  query {
    shares {
      name
      free
      used
      size
      cache
      comment
    }
  }
`;

export const NETWORK_INFO_QUERY = `
  query {
    info {
      networkInterfaces {
        name
        status
      }
    }
  }
`;

// ==================== Mutations ====================

export const START_CONTAINER_MUTATION = `mutation StartContainer($id: PrefixedID!) { docker { start(id: $id) { id state } } }`;
export const STOP_CONTAINER_MUTATION = `mutation StopContainer($id: PrefixedID!) { docker { stop(id: $id) { id state } } }`;
export const PAUSE_CONTAINER_MUTATION = `mutation PauseContainer($id: PrefixedID!) { docker { pause(id: $id) { id state } } }`;
export const RESUME_CONTAINER_MUTATION = `mutation UnpauseContainer($id: PrefixedID!) { docker { unpause(id: $id) { id state } } }`;

export const START_VM_MUTATION = `mutation StartVm($id: PrefixedID!) { vm { start(id: $id) } }`;
export const STOP_VM_MUTATION = `mutation StopVm($id: PrefixedID!) { vm { stop(id: $id) } }`;
export const PAUSE_VM_MUTATION = `mutation PauseVm($id: PrefixedID!) { vm { pause(id: $id) } }`;
export const RESUME_VM_MUTATION = `mutation ResumeVm($id: PrefixedID!) { vm { resume(id: $id) } }`;
export const REBOOT_VM_MUTATION = `mutation RebootVm($id: PrefixedID!) { vm { reboot(id: $id) } }`;

// 【续 39-1 候选 - 2026-06-18】轻量探活(3s 内回,启动期健康自检用)
export const ONLINE_QUERY = 'query { online }';

// 【续 42.2 2026-06-18】鉴权必需 query。
// unraid-api 对 `{online}` 不鉴权(任何人能查在线状态),错 apiKey 也返 online:true。
// 错 apiKey 改查 `{info { os { hostname } } }`,unraid-api 触发鉴权 → HTTP 200 +
// errors[].extensions.code = 'UNAUTHENTICATED'(违反 GraphQL spec)。
// graphql.ts 在 errors 里 catch 这码加 [鉴权失败] 前缀;healthCheck 用 AUTH_CHECK_QUERY
// 验证 apiKey 有效性,不能拿 ONLINE_QUERY 顶替。
export const AUTH_CHECK_QUERY = 'query { info { os { hostname } } }';
