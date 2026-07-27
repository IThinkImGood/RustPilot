import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = path.join(root, "apps", "web", "public", "brand");
const sourceSvg = path.join(brandDir, "logo-small.svg");
const tempPng = path.join(brandDir, "logo-small-256.png");
const outputIco = path.join(brandDir, "logo.ico");

await fs.mkdir(brandDir, { recursive: true });

await sharp(sourceSvg)
  .resize(256, 256, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png()
  .toFile(tempPng);

const icon = await pngToIco(tempPng);
await fs.writeFile(outputIco, icon);
await fs.rm(tempPng, { force: true });

console.log(`Created ${path.relative(root, outputIco)}`);
