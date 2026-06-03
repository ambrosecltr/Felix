/**
 * Builds a macOS-style app icon from resources/icon-source.png:
 *  - places the art on the standard Apple icon grid (rounded "squircle" with
 *    transparent margins so it matches other dock icons)
 *  - writes resources/icon.png (1024) for the dev dock
 *  - writes resources/icon.icns for packaged builds
 *
 * Run: node scripts/make-app-icon.mjs
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const resources = join(root, "apps/desktop/resources");
const source = join(resources, "icon-source.png");

// Apple icon grid (1024 canvas): the rounded square spans ~824px, centered,
// with a corner radius of ~185px. The artwork sits inside that shape.
const SIZE = 1024;
const SHAPE = 824;
const RADIUS = 185;
const MARGIN = Math.round((SIZE - SHAPE) / 2);

// Squircle-ish mask: a rounded rectangle of SHAPE x SHAPE on a transparent
// 1024 canvas. (A rounded rect closely matches macOS at icon sizes.)
const maskSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
     <rect x="${MARGIN}" y="${MARGIN}" width="${SHAPE}" height="${SHAPE}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/>
   </svg>`,
);

async function buildBase() {
  // Scale the source art to fill the shape, then center it on a 1024 canvas.
  const art = await sharp(source)
    .resize(SHAPE, SHAPE, { fit: "cover", position: "centre" })
    .toBuffer();

  const onCanvas = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: art, left: MARGIN, top: MARGIN }])
    .png()
    .toBuffer();

  const mask = await sharp(maskSvg).png().toBuffer();

  // Apply the rounded-rect mask so corners become transparent.
  return sharp(onCanvas)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function main() {
  const base = await buildBase();
  writeFileSync(join(resources, "icon.png"), base);

  // Build .icns via iconutil from a temporary .iconset.
  const work = mkdtempSync(join(tmpdir(), "felix-iconset-"));
  const iconset = join(work, "icon.iconset");
  execFileSync("mkdir", ["-p", iconset]);

  const variants = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [px, name] of variants) {
    const buf = await sharp(base).resize(px, px).png().toBuffer();
    writeFileSync(join(iconset, name), buf);
  }

  execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(resources, "icon.icns")]);
  rmSync(work, { recursive: true, force: true });

  console.log("Wrote resources/icon.png (1024) and resources/icon.icns");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
