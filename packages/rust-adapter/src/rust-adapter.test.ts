import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultServerSettings } from "@rustpilot/shared";
import { RustAdapter } from "./adapter.js";
import { generateLaunchArguments, generateRedactedLaunchArguments } from "./launchArgs.js";
import { generateSteamCmdInstallArgs } from "./steamcmd.js";

describe("launch args", () => {
  it("generates RustDedicated arguments and redacts secrets", () => {
    const args = generateLaunchArguments(defaultServerSettings);
    expect(args).toContain("-batchmode");
    expect(args).toContain("+server.identity");
    expect(args).toContain("+rcon.password");
    expect(args).toContain(defaultServerSettings.rconPassword);
    expect(generateRedactedLaunchArguments(defaultServerSettings)).not.toContain(
      defaultServerSettings.rconPassword
    );
  });

  it("omits empty optional URL arguments", () => {
    const args = generateLaunchArguments({ ...defaultServerSettings, serverUrl: "", headerImageUrl: "" });
    expect(args).not.toContain("+server.url");
    expect(args).not.toContain("+server.headerimage");
  });
});

describe("steamcmd args", () => {
  it("uses app 258550 with anonymous login and validate", () => {
    const args = generateSteamCmdInstallArgs("C:\\rust-server");
    expect(args).toContain("+force_install_dir");
    expect(args).toContain("+login");
    expect(args).toContain("anonymous");
    expect(args).toContain("+app_update");
    expect(args).toContain("258550");
    expect(args).toContain("validate");
  });
});

describe("adapter paths", () => {
  it("uses a configured install directory for managed server files", () => {
    const adapter = new RustAdapter("C:\\RustPilotData");
    const paths = adapter.getPaths({
      ...defaultServerSettings,
      installDirectory: "D:\\RustServers\\MijnServer"
    });
    expect(paths.dataRoot).toBe("D:\\RustServers\\MijnServer");
    expect(paths.steamCmdDir).toBe("D:\\RustServers\\MijnServer\\steamcmd");
    expect(paths.serverDir).toBe("D:\\RustServers\\MijnServer\\servers\\default\\server");
    expect(paths.dbPath).toBe("C:\\RustPilotData\\app.db");
  });

  it("validates SteamCMD inside the configured install directory", () => {
    const runtimeDir = mkdtempSync(path.join(os.tmpdir(), "rustpilot-runtime-"));
    const installDir = mkdtempSync(path.join(os.tmpdir(), "rustpilot-install-"));
    try {
      const adapter = new RustAdapter(runtimeDir);
      const settings = { ...defaultServerSettings, installDirectory: installDir };
      const paths = adapter.getPaths(settings);
      mkdirSync(paths.steamCmdDir, { recursive: true });
      mkdirSync(paths.serverDir, { recursive: true });
      writeFileSync(paths.steamCmdExe, "");
      writeFileSync(paths.rustDedicatedExe, "");
      expect(adapter.validateInstallation(settings)).toEqual({ valid: true, errors: [] });
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(installDir, { recursive: true, force: true });
    }
  });
});
