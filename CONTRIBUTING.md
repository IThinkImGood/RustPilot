# Contributing

RustPilot phase 1 focuses on a small, working core. Keep contributions modular and Rust-specific.

## Workflow

1. Install dependencies with `npm install`.
2. Run `npm run test`, `npm run typecheck`, and `npm run lint`.
3. Add tests for validation, state transitions, process flows, and storage behavior when changing those areas.
4. Do not log secrets or add Rust server files to the repository.

Use official Valve/Facepunch documentation as the primary source for SteamCMD and Rust Dedicated Server parameters.
