import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@rustpilot/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@rustpilot/rust-adapter": path.resolve(__dirname, "packages/rust-adapter/src/index.ts")
    }
  }
});
