# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.2.1] - 2026-08-10

### Fixed

- Shares file manager: `#` filenames were truncated by URL fragment parsing; Chinese rename/move/copy failed (MOVE/COPY `Destination` header threw on non-ASCII) — DAV paths are now encoded uniformly at every exit point
- Shares root manual refresh was a no-op within the 30-minute cache window (cache namespace is now invalidated first)
- Shares large-file download/preview was killed by the 15s default DAV timeout (raised to 120s for full-file reads)
- Shares share links were double-encoded, causing 404 for Chinese paths
- Safari could produce NaN dates in file listings (autoindex date parsing no longer relies on `Date.parse` locale behavior)
- Settings: server URLs with spaces after the protocol, missing protocol, or invalid format were saved as-is and broke the app — all save paths now normalize and validate the URL
- Settings "About" version was hardcoded and stale; it is now injected at build time from `package.json`
- `release.sh` now syncs the `package.json` version field during releases

### Known limitations

- Multi-server switching only swaps the API key; data requests still go through this container's same-origin proxy (the unRAID host running the container). Single-server usage is unaffected.

## [1.2.0] - 2026-08-09

### Added

- Enhanced VM details (CPU/memory/disks/network/passthrough/snapshots, read from libvirt XML)
- Local alert list in the Dashboard alert bell (unRAID notifications viewable in-app)

### Fixed

- PWA caching overhaul: build-hash-versioned service worker, no-cache headers, auto-reload on update — iOS PWAs no longer stick on old bundles
- Dashboard fixes: manual refresh cache invalidation, trend chart labels, weighted array usage, favorites touch targets, retry button on error banner
- Container tab fixes: refresh button disabled state, unified cache invalidation, VM deep-link highlight
