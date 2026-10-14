/**
 * Renders the PWA icons in public/icons from src/app/icon.svg (run again after
 * changing the logo):  node scripts/build-app-icons.mjs
 *
 * "any" icons are the logo on the app background; "maskable" ones keep the logo
 * inside the safe zone (80%), since Android crops them to a circle or squircle.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const svg = await readFile(new URL('../src/app/icon.svg', import.meta.url));
const BACKGROUND = '#06060b';

async function icon(size, logoShare, file) {
  const logo = await sharp(svg, { density: 512 }).resize(Math.round(size * logoShare)).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(fileURLToPath(new URL(`../public/icons/${file}`, import.meta.url)));
  console.log(file);
}

await icon(192, 0.84, 'icon-192.png');
await icon(512, 0.84, 'icon-512.png');
await icon(512, 0.6, 'maskable-512.png');
await icon(180, 0.84, 'apple-touch-icon.png');
