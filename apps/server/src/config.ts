import path from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  webDevHost: string;
  webDevPort: number;
  webDevUrl: string;
  isDevelopment: boolean;
}

export function loadAppConfig(): AppConfig {
  const host = process.env.RUSTPILOT_HOST ?? "127.0.0.1";
  const port = Number(process.env.RUSTPILOT_PORT ?? 40120);
  const webDevHost = process.env.RUSTPILOT_WEB_DEV_HOST ?? "127.0.0.1";
  const webDevPort = Number(process.env.RUSTPILOT_WEB_DEV_PORT ?? 3001);
  return {
    host,
    port,
    dataDir: path.resolve(process.env.RUSTPILOT_DATA_DIR ?? "data"),
    webDevHost,
    webDevPort,
    webDevUrl: process.env.RUSTPILOT_WEB_DEV_URL ?? `http://${webDevHost}:${webDevPort}`,
    isDevelopment: process.env.NODE_ENV !== "production"
  };
}
