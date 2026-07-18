# Changelog

## v0.1.0-alpha.1

Early open-source preview for local Rust Dedicated Server management on Windows 10/11 x64.

### Included

- First-run setup wizard with setup guarding.
- User-selectable install directory with server-side validation.
- SteamCMD download and Rust Dedicated Server install flow.
- Local web panel on `http://127.0.0.1:40120`.
- WebSocket-backed live console output.
- Basic server process controls.
- SQLite-backed local settings and setup state.
- RCON password redaction in logs and API status.

### Notes

- Suitable for local testing and early adopters.
- Not recommended yet for unattended production hosting.
- Single executable packaging is not yet end-to-end released.
