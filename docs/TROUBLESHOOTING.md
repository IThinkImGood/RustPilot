# Troubleshooting

## Web Panel Does Not Open

Check whether port `40815` is free and whether the backend logs that the web panel is available.

## SteamCMD Installation Fails

Check internet access, antivirus blocks, and write permissions in the `data` folder. The installation log appears in the terminal, web console, and `data/logs/rustpilot.log`.

## Server Does Not Start

Check that `data/servers/default/server/RustDedicated.exe` exists and that the ports are not used by another process.

## Commands Do Not Respond

Phase 1 writes commands to stdin of `RustDedicated.exe`. If Rust does not process that input reliably in your environment, use phase 2 WebRCON once it is added.
