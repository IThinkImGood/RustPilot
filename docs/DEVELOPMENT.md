# Development

## Scripts

```powershell
npm run dev
npm run build
npm run start
npm run test
npm run test:watch
npm run lint
npm run typecheck
npm run format
```

## Packaging Direction

The production build compiles TypeScript and exports the web panel as static files. The backend can then serve the API, WebSockets, and web panel from the same HTTP server.

For a future `RustPilot.exe`, options such as Node SEA or a lightweight Windows launcher around the Node build are worth investigating. This repository does not yet claim a tested single-file executable.

## UI Components

Use `apps/web/app/lib/Tooltip.tsx` for short contextual help on labels and buttons. The component uses a subtle grey info icon, appears on hover, focus, and tap, and keeps explanations compact so forms remain quiet.

Setup live validation lives in `apps/web/app/lib/setupValidation.ts`. Keep field help, validation messages, and submit validation separate: tooltips explain meaning, validation messages show concrete input problems.

Install directory validation happens server-side in `apps/server/src/installDirectoryValidation.ts`. The setup wizard can show results and collect user choices, but `/api/install` must always validate again before SteamCMD or Rust Dedicated Server starts.

## Manual Windows End-to-End Test

1. Remove or rename `data`.
2. Start RustPilot with `npm run dev`, or after a build with `npm run start`.
3. Verify that one CMD window is active.
4. Verify that the web panel opens automatically.
5. Verify that the setup wizard appears.
6. Start installation.
7. Verify that SteamCMD is downloaded.
8. Verify that Rust Dedicated Server is installed through App ID `258550`.
9. Verify that real installation output appears in both CMD and the browser.
10. Verify that `RustDedicated.exe` exists.
11. Complete configuration.
12. Start the Rust server.
13. Verify that real server output appears in the same RustPilot CMD window.
14. Verify that the same output appears live in the web panel.
15. Stop the server from the web panel.
16. Verify that RustPilot itself keeps running.
17. Start the server again.
18. Stop RustPilot with Ctrl+C.
19. Verify that the Rust server is stopped cleanly.
20. Start RustPilot again.
21. Verify that the existing setup loads.
22. Verify auto-start if enabled.
23. Try to open RustPilot a second time.
24. Verify that no second server instance starts.
