import { spawn } from "node:child_process";

export function openBrowser(url: string): void {
  if (!url.startsWith("http://127.0.0.1:")) throw new Error("Only local RustPilot URLs can be opened.");
  const command = process.platform === "win32" ? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true, shell: false });
  child.unref();
}
