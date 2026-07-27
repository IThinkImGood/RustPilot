# Security

RustPilot is local management software, not a remote hosting panel.

- HTTP binds to `127.0.0.1`.
- API and WebSockets only accept local origins.
- The web panel requires Steam login after the first owner claim.
- The first successful Steam login becomes the local owner.
- Owner, admin, and viewer roles are stored server-side.
- Role permissions are checked server-side for user management, settings, server control, console commands, announcements, player moderation, CFG editing, backups, wipes, and danger-zone actions.
- Viewer accounts are read-only for mutating API actions.
- Mutating API actions require a SameSite CSRF cookie plus matching `X-RustPilot-CSRF` header.
- Steam login routes and mutating API actions are rate-limited.
- Authenticated mutating actions are stored in the SQLite action log.
- The frontend must not provide executable paths or arbitrary shell commands.
- Processes are started with argument arrays and `shell: false`.
- RCON passwords are redacted in logs and status responses.
- Server identity and paths are validated against path traversal.

RustPilot is local-first and binds to localhost by default. Remote access is optional and should be handled by your own VPN or HTTPS reverse proxy.

Exposing the panel exposes server controls, console/RCON actions, backups, restores, wipes, CFG editing, and local path/status information. Use HTTPS, trusted access rules, and provider-level protections when you place RustPilot behind a reverse proxy.

Public remote binding, reverse-proxy guidance, TLS assumptions, and broader session hardening are planned future security work.
