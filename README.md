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

## First Run Tutorial

1. Start RustPilot with `npm run dev`.
2. Open `http://127.0.0.1:40120`.
3. Complete the setup wizard.
4. Choose an absolute install directory, for example `D:\RustServers\MyServer`. Leave the field empty only if you want RustPilot to use its default local data folder.
5. Review the server name, identity, ports, world settings, and RCON password.
6. Click `Install` and wait for SteamCMD to download the Rust Dedicated Server files.
7. When setup is complete, use the dashboard or console page to start and manage the server.

If you want to test setup again, go to `Settings`, open `DANGER ZONE`, and use `Reset installation`. This stops the server, removes managed install folders and setup state, and sends RustPilot back to the setup wizard.

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

The backend serves the static Next.js export from `apps/web/out`.

## Windows Portable Release

```powershell
npm run package:win
```

This creates `release/RustPilot-v<version>-win-x64.zip` with a real `RustPilot.exe` launcher, a bundled Node runtime, production server files, production dependencies, and the static web panel. Users can unzip it and start `RustPilot.exe`; no `npm run dev` or local Node.js install is required.

The portable release stores runtime data in the `data` folder next to `RustPilot.exe` unless `RUSTPILOT_DATA_DIR` is set.

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
