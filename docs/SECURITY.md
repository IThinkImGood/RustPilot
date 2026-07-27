# Security

RustPilot is local management software, not a remote hosting panel.

- HTTP binds to `127.0.0.1`.
- API and WebSockets only accept local origins.
- The web panel has no public-internet authentication, user roles, or Steam login yet.
- The frontend must not provide executable paths or arbitrary shell commands.
- Processes are started with argument arrays and `shell: false`.
- RCON passwords are redacted in logs and status responses.
- Server identity and paths are validated against path traversal.

Do not expose the RustPilot panel directly to the internet and do not port forward the panel port. Exposing the panel would expose server controls, console/RCON actions, backups, restores, wipes, CFG editing, and local path/status information.

If remote administration is needed before the authentication/roles phase is complete, use a trusted remote desktop solution or a private VPN instead of a public port forward.

Remote binding, accounts, Steam login, and roles are planned future security work.
