import fs from "node:fs";
import path from "node:path";
import { rcedit } from "rcedit";

const [exePath, iconPath] = process.argv.slice(2);

if (!exePath || !iconPath) {
  throw new Error("Usage: node scripts/set-exe-icon.mjs <exePath> <iconPath> [version]");
}

if (!fs.existsSync(exePath)) {
  throw new Error(`Missing executable: ${exePath}`);
}

if (!fs.existsSync(iconPath)) {
  throw new Error(`Missing icon: ${iconPath}`);
}

await rcedit(path.resolve(exePath), {
  icon: path.resolve(iconPath)
});

console.log(`Updated icon for ${exePath}`);
