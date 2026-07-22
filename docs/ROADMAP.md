# Roadmap

## Phase 2 - WebRCON Baseline

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

Future Phase 2 polish:

- Parse player list responses into structured table rows
- Add safer guided forms for common admin commands

## Phase 3

- Automatic backups
- Wipe planner
- Map and blueprint wipes
- New seeds
- Pre-wipe backup
- Update scheduling

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
