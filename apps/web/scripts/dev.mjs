import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const host = process.env.RUSTPILOT_WEB_DEV_HOST ?? "127.0.0.1";
const port = process.env.RUSTPILOT_WEB_DEV_PORT ?? "3001";
process.env.NEXT_PUBLIC_RUSTPILOT_HOST = process.env.RUSTPILOT_HOST ?? "127.0.0.1";
process.env.NEXT_PUBLIC_RUSTPILOT_PORT = process.env.RUSTPILOT_PORT ?? "40815";
process.env.NEXT_PUBLIC_RUSTPILOT_WEB_DEV_PORT = port;
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

console.log(`[RustPilot Web] Development frontend: http://${host}:${port}`);

const child = spawn(process.execPath, [nextBin, "dev", "-H", host, "-p", port], {
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
