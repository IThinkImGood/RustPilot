# RustPilot

RustPilot is an open-source management app for a local Rust Dedicated Server on Windows 10/11 x64. It aims to provide the same practical experience as a foreground console application with a local web panel: `RustPilot` starts the backend, opens `http://127.0.0.1:40120`, manages SteamCMD, and starts `RustDedicated.exe` as a child process.

## Project Status

`v0.1.0-alpha.1` is an early preview that is usable for local testing and early adopters. Core functionality is present: first-run setup, install directory selection, SteamCMD download, Rust Dedicated Server installation through Steam app `258550`, SQLite settings, WebSockets, live console output, and process management.

Do not use this version for unattended production hosting yet. Expect rough edges and test your install path before using existing server files.

## Prerequisites

- Windows 10 or 11 x64
- Node.js 24+
- npm 11+
- Enough disk space for SteamCMD and Rust Dedicated Server

## Development

```powershell
npm install
npm run dev
```

Then open `http://127.0.0.1:40120`. In development, the backend proxies to the Next.js dev server.

## Tests And Checks

```powershell
npm run test
npm run typecheck
npm run lint
```

## Production Build

```powershell
npm run build
npm run start
```

The backend serves the static Next.js export from `apps/web/out`. A real single-file `RustPilot.exe` is not claimed or tested yet; see `docs/DEVELOPMENT.md` for packaging direction.

## Runtime Data

Development uses this default layout:

```text
data/
  steamcmd/
  servers/default/server/
  servers/default/identity/
  servers/default/backups/
  logs/
  app.db
  config/
```

Absolute user paths are not hardcoded. SteamCMD is downloaded only from Valve's official SteamCMD ZIP URL. Rust server files are not bundled or redistributed by RustPilot.

## Known Limitations

- Phase 1 targets local Windows use only.
- One server profile.
- Console commands are written to stdin of the child process; reliable remote command execution through WebRCON is planned for phase 2.
- No player list, backups, wipe planner, plugin management, or remote account system yet.
- Single executable packaging is prepared, but not tested end to end yet.

## Security

RustPilot binds to `127.0.0.1` by default, accepts only local origins, and redacts RCON passwords in logs and API status. Do not expose the panel to the network.

## Contributing

See `CONTRIBUTING.md`.
