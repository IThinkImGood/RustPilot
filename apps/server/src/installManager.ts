import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { STEAMCMD_WINDOWS_ZIP_URL } from "@rustpilot/rust-adapter";
import { type ServerSettings } from "@rustpilot/shared";
import { RustAdapter } from "@rustpilot/rust-adapter";
import type { EventLogger } from "./logger.js";
import type { ProcessRunner } from "./processRunner.js";
import type { Storage } from "./storage.js";

export class InstallManager {
  private running = false;

  constructor(
    private readonly adapter: RustAdapter,
    private readonly storage: Storage,
    private readonly logger: EventLogger,
    private readonly runner: ProcessRunner
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  async install(settings: ServerSettings): Promise<void> {
    if (this.running) throw new Error("An installation or update is already running.");
    this.running = true;
    try {
      const paths = this.adapter.getPaths(settings);
      fs.mkdirSync(paths.steamCmdDir, { recursive: true });
      fs.mkdirSync(paths.serverDir, { recursive: true });
      if (!fs.existsSync(paths.steamCmdExe)) {
        this.storage.setInstallationState("downloading_steamcmd");
        this.logger.emit("steamcmd", "system", "info", "SteamCMD wordt gedownload vanaf de officiele Valve-distributie.");
        const zipPath = path.join(os.tmpdir(), `rustpilot-steamcmd-${Date.now()}.zip`);
        await this.downloadFile(STEAMCMD_WINDOWS_ZIP_URL, zipPath);
        this.storage.setInstallationState("extracting_steamcmd");
        this.logger.emit("steamcmd", "system", "info", "SteamCMD-archief wordt uitgepakt.");
        new AdmZip(zipPath).extractAllTo(paths.steamCmdDir, true);
        fs.rmSync(zipPath, { force: true });
      }

      this.storage.setInstallationState("installing_server");
      await this.runSteamCmdAllowingVerifiedInstall(settings);
      if (!fs.existsSync(paths.rustDedicatedExe)) {
        throw new Error("Installation finished, but RustDedicated.exe was not found.");
      }
      this.storage.setInstallationState("installed");
      this.logger.emit("steamcmd", "system", "info", "Rust Dedicated Server is geinstalleerd.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.storage.setInstallationState("install_failed", message);
      this.logger.emit("steamcmd", "stderr", "error", message);
      throw error;
    } finally {
      this.running = false;
    }
  }

  async update(settings: ServerSettings): Promise<void> {
    if (this.running) throw new Error("An installation or update is already running.");
    this.running = true;
    try {
      this.storage.setInstallationState("updating_server");
      await this.runSteamCmdAllowingVerifiedInstall(settings);
      this.storage.setInstallationState("installed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.storage.setInstallationState("update_failed", message);
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async downloadFile(url: string, destination: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }
    fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  }

  private runSteamCmd(settings: ServerSettings): Promise<void> {
    const paths = this.adapter.getPaths(settings);
    const args = this.adapter.generateSteamCmdInstallArgs(settings);
    this.logger.emit("steamcmd", "system", "info", `steamcmd.exe ${args.join(" ")}`);
    const child = this.runner.spawn(paths.steamCmdExe, args, { cwd: paths.steamCmdDir });
    child.stdout.on("data", (data: Buffer) => this.pipeLines("stdout", data));
    child.stderr.on("data", (data: Buffer) => this.pipeLines("stderr", data));
    return new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`SteamCMD stopped with exit code ${code ?? "null"} signal ${signal ?? "null"}.`));
      });
    });
  }

  private async runSteamCmdAllowingVerifiedInstall(settings: ServerSettings): Promise<void> {
    try {
      await this.runSteamCmd(settings);
    } catch (error) {
      const paths = this.adapter.getPaths(settings);
      if (fs.existsSync(paths.rustDedicatedExe)) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.emit(
          "steamcmd",
          "system",
          "warn",
          `SteamCMD finished with a warning after a verifiable installation: ${message}`
        );
        return;
      }
      throw error;
    }
  }

  private pipeLines(stream: "stdout" | "stderr", data: Buffer): void {
    for (const line of data.toString("utf8").split(/\r?\n/).filter(Boolean)) {
      this.logger.emit("steamcmd", stream, stream === "stderr" ? "warn" : "info", line);
    }
  }
}
