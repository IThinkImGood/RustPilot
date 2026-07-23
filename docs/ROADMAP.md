# Roadmap

## Phase 2 - WebRCON Baseline: complete

- Real WebRCON integration: implemented
- Reliable remote console commands: implemented with stdin fallback
- Player list query: implemented through WebRCON command
- Kick and ban actions: implemented through WebRCON commands
- Server information query: implemented through WebRCON command
- Scheduled restarts: implemented as one active local scheduled restart
- Server announcements: implemented through WebRCON `say`
- Persist scheduled restarts across RustPilot restarts: implemented
- Fixed daily restart schedules: implemented
- Countdown announcements before scheduled restarts: implemented
- Structured player list parsing: implemented for JSON and common text output variants
- Safer guided forms for common admin commands: implemented for announcements, kick, ban, unban, kick-all, server save, scheduled restarts, and users.cfg owner/moderator entries

## Phase 3 - Backups, wipes, and logs: complete

- Manual backups: implemented
- Automatic backups: implemented
- Backup delete: implemented
- Backup restore with safety backup: implemented
- Official Rust force wipe planner plus additional custom wipe schedules: implemented
- Map and blueprint wipes: implemented
- New seed workflow: implemented
- Pre-wipe backup: implemented
- Manual run-now wipe action: implemented
- Dedicated Official, Custom, and Run & History wipe pages: implemented
- Log viewer for live history and saved log files: implemented
- Source-aware log filters for RustPilot, SteamCMD, Rust server, commands, warnings/errors, player activity, and chat: implemented
- RustPilot modal confirmations for destructive backup and wipe actions: implemented

## Phase 4

- Carbon
- Oxide/uMod
- Plugin installation
- Plugin configuration
- Plugin updates
- Plugin failure detection

## Phase 5

- Windows production installer
- Automatic RustPilot updates
- Linux agent
- Remote management with authentication
- Roles and permissions
- Multiple server profiles
