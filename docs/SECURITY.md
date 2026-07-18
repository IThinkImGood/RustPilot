# Security

RustPilot is local management software, not a remote hosting panel.

- HTTP binds to `127.0.0.1`.
- API and WebSockets only accept local origins.
- The frontend must not provide executable paths or arbitrary shell commands.
- Processes are started with argument arrays and `shell: false`.
- RCON passwords are redacted in logs and status responses.
- Server identity and paths are validated against path traversal.

Remote binding, accounts, and roles are intentionally out of scope for phase 1.
