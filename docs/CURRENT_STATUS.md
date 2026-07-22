# RustPilot Current Status

Last updated: 2026-07-22

## Current State

RustPilot has a working first-run setup flow with setup guarding, development routing through the backend, setup wizard tooltips, live field validation, and server-side install directory validation.

Public URL:

```text
http://127.0.0.1:40815
```

The internal Next.js development server normally runs on:

```text
http://127.0.0.1:3001
```

## Key Features

- Incomplete setup redirects to `/setup`.
- Dashboard, console, and settings are protected until setup is complete.
- Backend blocks start, stop, restart, command, update, and normal settings changes before setup is complete.
- Development backend proxies frontend routes to Next on port `3001`.
- `/api/*` and `/ws` stay on the backend.
- WebSocket reconnect/status handling is improved.
- Setup wizard has contextual tooltips and live validation.
- Setup wizard lets users choose an install directory.
- `installDirectory` is stored in server configuration.
- RustPilot uses the chosen install directory for SteamCMD, server files, identity data, backups, and logs.
- The RustPilot database remains in the app runtime folder.
- Installation can only start after server-side install directory validation.
- The Backups top-nav dropdown links to separate Manual and Automatic backup pages for Rust identity data and cfg files.
- The Wipes page separates the official Rust force wipe from additional custom wipe schedules, follows Facepunch's first-Thursday monthly wipe timer, and combines close custom wipes to avoid duplicate wipes.
- Map wipes can keep the current seed, generate a random seed, or store an explicit next seed before restart.
- Manual backups can be restored after explicit confirmation; RustPilot creates a safety backup before replacing current identity data.
- The Logs page in the left navigation lists safe `.log` files and reads the latest log content from disk.

## Install Directory Validation

Backend file:

```text
apps/server/src/installDirectoryValidation.ts
```

Validation checks include:

- directory exists or can be created;
- write access;
- directory versus file;
- invalid Windows path characters;
- relative paths;
- path traversal such as `..`;
- non-empty server folders;
- recognizable existing RustPilot/Rust installation;
- free disk space.

When an existing installation is detected, the user must choose:

- use the existing installation;
- repair the installation;
- cancel.

## Important Files

Frontend:

```text
apps/web/app/setup/page.tsx
apps/web/app/lib/Tooltip.tsx
apps/web/app/lib/setupValidation.ts
apps/web/app/lib/tooltipState.ts
apps/web/app/lib/AppShell.tsx
apps/web/app/lib/layoutMode.ts
apps/web/app/globals.css
```

Backend:

```text
apps/server/src/api.ts
apps/server/src/index.ts
apps/server/src/setupStatus.ts
apps/server/src/installDirectoryValidation.ts
apps/server/src/backups.ts
apps/server/src/backupScheduler.ts
apps/server/src/wipePlanner.ts
apps/server/src/websocket.ts
```

Shared/adapter:

```text
packages/shared/src/schemas.ts
packages/rust-adapter/src/adapter.ts
```

## Known Checks

Passing:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Current test count:

```text
14 test files passed
99 tests passed
```

`npm run lint` currently reports existing `any` warnings, but no errors.

## Start Command

Use:

```powershell
cd C:\Websites\apps\RustControl
npm run dev
```

Open:

```text
http://127.0.0.1:40815
```

Do not open port `3001` directly.

## Clean Install

For a clean development install, remove the active runtime folder:

```text
C:\Websites\apps\RustControl\apps\server\data
```

Stop project Node processes and any `RustDedicated.exe` process from this workspace before removing that folder.
