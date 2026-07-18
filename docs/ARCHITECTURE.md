# Architecture

RustPilot is a TypeScript monorepo using npm workspaces.

- `packages/shared`: shared Zod schemas, API types, state transitions, path safety, and secret redaction.
- `packages/rust-adapter`: Rust-specific paths, SteamCMD arguments, launch arguments, and installation validation.
- `apps/server`: foreground Node.js console application, Express API, WebSockets, SQLite, installer, process manager, and terminal input.
- `apps/web`: Next.js web panel with setup, dashboard, console, and settings.

The backend owns filesystem access, SteamCMD, SQLite, and `RustDedicated.exe`. React components only call typed API actions.

## External Assumptions

SteamCMD follows Valve's flow:

```text
steamcmd.exe +force_install_dir <server-folder> +login anonymous +app_update 258550 validate +quit
```

Rust launch arguments follow Valve/Facepunch documentation for `+server.identity`, `+server.hostname`, `+server.port`, `+server.queryport`, `+rcon.port`, `+rcon.password`, and `+rcon.web`.
