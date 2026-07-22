# unRAID Mobile

**English** | [简体中文](README_CN.md)

[![Telegram Group](https://img.shields.io/badge/Telegram-Group-2CA5E0?logo=telegram&logoColor=white)](https://t.me/unraid_mobile)

A mobile-optimized management interface for unRAID servers. React 18 + TypeScript + Vite + Tailwind CSS,
single-container deployment, data via the unRAID GraphQL API (7.2+).

## Features (Free / Pro)

| Free (works out of the box) | Pro (unlocked with a license key) |
|------|------|
| Full dashboard monitoring: CPU / memory / network / disks / array / history charts / favorites | Container details (ports/mounts/network/disk usage), container logs |
| Container & VM lists + single start/stop / restart / pause | VM details |
| Shares file browsing / download / image preview | **Compose stack management** (list/logs/up/down/pull/rebuild/yaml editing)¹ |
| Host system logs (syslog) | **CPU temperature**¹ (reads /sys/class/hwmon directly, never spins up disks), Shares write operations (upload/mkdir/delete/rename/text editing) |
| Global search, command palette, config backup/import, single server, dark theme, PWA | Container batch operations, **multi-server**, alert notifications (Webhook), disk cleanup |

¹ Requires the host agent (compose-api) — a small component installed on the unRAID host as described
in "Pro host agent" below. **Installation modifies the boot script `/boot/config/go`; read the risk
notice there first.** The free version requires no host installation at all.

Pro is a **one-time purchase**: pay once, use forever (includes 1 year of updates). Enter the key in
"Settings → License" to unlock — verification is fully offline, no network calls, no data uploaded.
See GitHub Releases / future announcements for purchase channels.

## Quick start (Docker Hub image)

```bash
docker run -d \
  --name unraid-mobile \
  -p 3999:80 \
  -e UNRAID_UPSTREAM=http://192.168.1.100:8001 \
  -v /mnt/user/appdata/unraid-mobile/config:/usr/share/nginx/html/config \
  bear0328/unraid-mobile:latest
```

Set `UNRAID_UPSTREAM` to your unRAID webGui address (no trailing slash) — the container's nginx
reverse-proxies `/graphql` to it. **A wrong value means all API requests return 502.**

Open `http://<unraid-IP>:3999`, go to "Settings" and fill in:

1. **Server URL** — e.g. `http://192.168.1.100` (your unRAID webGui address, no trailing slash)
2. **API key** — an unRAID GraphQL API key (webGui → Settings → API Keys)

> The API key lives only in your own browser's localStorage and is **never** written to any file on
> the server.

Image tags: `latest` (newest stable) / `1.0.1` (pinned version). linux/amd64 only (unRAID platform).

### Feature ↔ mount matrix

Core features (dashboard/containers/VMs/settings) work with **zero mounts**. Advanced features are
enabled per mount:

| Feature | Mount / dependency | Notes |
|------|------------|------|
| Config persistence | `-v .../config:/usr/share/nginx/html/config` | Stores serverUrl only; recommended |
| File manager | `-v /mnt/user:/mnt/user` + `-v /mnt/cache:/mnt/cache` + WebDAV password file | Password entered in Settings, must match nginx `.davpasswd` |
| Host system logs | `-v /var/log:/mnt/hostlog:ro` + log password file | Same idea, `.logpasswd` |
| Compose stacks / CPU temperature (Pro) | `-v /var/run/php-fpm.sock:/hostrun/php-fpm.sock` + host agent | See next section |

Full docker-compose example:

```yaml
services:
  unraid-mobile:
    image: bear0328/unraid-mobile:latest
    container_name: unraid-mobile
    ports:
      - "3999:80"
    environment:
      - UNRAID_UPSTREAM=http://192.168.1.100:8001  # change to your unRAID address
    volumes:
      - /mnt/user/appdata/unraid-mobile/config:/usr/share/nginx/html/config
      # uncomment as needed:
      # - /mnt/user:/mnt/user
      # - /mnt/cache:/mnt/cache
      # - /var/log:/mnt/hostlog:ro
      # - /var/run/php-fpm.sock:/hostrun/php-fpm.sock
    restart: unless-stopped
```

## Pro host agent (compose-api): Compose stacks + CPU temperature

The Compose tab and CPU temperature (both Pro features) rely on a small host-side component
(`api.php`, executed as root via the host's php-fpm to run `docker compose` / read
`/sys/class/hwmon` directly — it never spins up sleeping disks).
Without it, those features show an install guide or a placeholder; **everything else is unaffected**.

> ⚠️ **Risk notice (read before installing)**
> The install script modifies the unRAID boot script **`/boot/config/go`** (a core script executed
> at system startup) so the agent is restored after reboots. Safeguards:
> - The original file is backed up to `/boot/config/go.unraid-mobile-bak` before any change
> - Only 3 lines are appended (tagged with 【unraid-mobile】); none of your existing lines are touched
> - The script asks you to type `YES` explicitly before doing anything
> - Uninstall: delete `/boot/config/plugins/unraid-mobile/` and the 3 tagged lines in `go` to fully
>   restore
>
> If you do not accept any modification to the boot script, do not install — every free feature
> works without it.

Prerequisite: the **compose.manager** plugin installed from Community Applications.

```bash
# Run as root on the unRAID host
mkdir -p /tmp/um-install && cd /tmp/um-install
curl -fsSL -o install-compose-api.sh \
  https://raw.githubusercontent.com/bear0328/unraid-mobile/v1.0.1/compose-api/install-compose-api.sh
curl -fsSL -o api.php \
  https://raw.githubusercontent.com/bear0328/unraid-mobile/v1.0.1/compose-api/api.php
bash install-compose-api.sh
```

The script: risk confirmation (type YES) → checks compose.manager → interactively asks for the API
key and writes it to `/boot/config/plugins/unraid-mobile/apikey` (mode 600) → installs api.php into
the compose.manager plugin directory → backs up and appends the `/boot/config/go` restore hook.
Idempotent, safe to re-run.

Afterwards add the php-fpm.sock mount to the container and recreate it; the Compose tab and CPU
temperature (once Pro is activated) are ready.

## Build from source

```bash
git clone https://github.com/bear0328/unraid-mobile.git
cd unraid-mobile
npm ci
npm run build        # output in dist/
npm test             # vitest
docker build -t unraid-mobile .
```

## unRAID GraphQL API limitations

### Docker containers
| Feature | Supported | Fields |
|------|------|------|
| List | ✅ | id, names, image, state, status, autoStart, created |
| Logs | ✅ | logs(tail) { lines { timestamp, message } } |
| Stats | ✅ | stats { cpuPercent, memUsage, memPercent } (subscription) |
| Start/stop | ✅ | mutation |
| Port mappings / mounts / network / disk usage | ✅ | ports / mounts / networkSettings / size* (details query) |

### Virtual machines
| Feature | Supported | Fields |
|------|------|------|
| List | ✅ | domains { name, uuid, state } |
| Start/stop | ✅ | mutation |
| Logs / memory / CPU / disks | ❌ | No such fields in the API |

## FAQ

**Q: Where can I ask questions or give feedback?**
Join the Telegram group: <https://t.me/unraid_mobile>, or open a GitHub issue.

**Q: API connection failed?**
Check the server URL format (no trailing slash), that the API key is valid, and that the container
can reach the unRAID webGui.

**Q: Ports/labels/network empty in container details?**
Ports/mounts/network/disk usage are Pro features and appear in the details view once activated;
if still empty, the container genuinely has no such config (e.g. host networking has no port
mappings).

**Q: Need to re-enter the API key after switching phone/browser?**
Yes. The API key lives only in the browser's localStorage and does not travel between devices;
no credentials are stored server-side.

## License & commercial model

This repository is licensed under the **Business Source License 1.1 (BSL)** (see [LICENSE](LICENSE)):

- ✅ Personal/home self-hosting: use, modify, and self-build freely (any number of servers)
- ✅ Four years after each version's release, that version converts to the fully free MIT license
- ❌ No resale; no offering this software as a paid/hosted service to third parties

Commercial model: all code is public, **Pro features are unlocked with an offline license key**
(enter it in Settings; one-time purchase, no online verification). Offline keys are "honesty-based"
by nature — real commercial protection comes from the BSL license. If you like this project,
buying Pro is the most direct way to support its development.
