import fs from "node:fs";
import path from "node:path";

export class SingleInstanceLock {
  private lockPath: string;

  constructor(dataDir: string) {
    this.lockPath = path.join(dataDir, "rustpilot.lock");
  }

  acquire(): boolean {
    fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
    if (fs.existsSync(this.lockPath)) {
      const pid = Number(fs.readFileSync(this.lockPath, "utf8"));
      if (pid && this.isRunning(pid)) return false;
      fs.rmSync(this.lockPath, { force: true });
    }
    fs.writeFileSync(this.lockPath, String(process.pid), { flag: "wx" });
    return true;
  }

  release(): void {
    try {
      if (fs.existsSync(this.lockPath) && fs.readFileSync(this.lockPath, "utf8") === String(process.pid)) {
        fs.rmSync(this.lockPath, { force: true });
      }
    } catch {
      // Best-effort cleanup during process shutdown.
    }
  }

  private isRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
