// Сжатие изображения для сайта: PNG/JPG/WebP → JPEG или WebP нужной ширины (через браузер Playwright, без доп. библиотек, работает на Windows/macOS/Linux).
// node scripts/img-web.mjs <in> <out.jpg|out.webp> [ширина=1600] [качество=0.84]
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const [inp, out, wArg, qArg] = process.argv.slice(2);
if (!inp || !out) { console.error('usage: img-web.mjs <in> <out.jpg|webp> [width] [quality]'); process.exit(1); }
const width = Number(wArg || 1600), quality = Number(qArg || 0.84);
const mime = /\.webp$/i.test(out) ? 'image/webp' : 'image/jpeg';
const buf = await fs.readFile(inp);
const ext = path.extname(inp).slice(1).toLowerCase().replace('jpg', 'jpeg');
const browser = await chromium.launch();
const page = await browser.newPage();
const dataUrl = await page.evaluate(async ({ b64, type, width, quality, mime }) => {
  const img = new Image(); img.src = `data:image/${type};base64,${b64}`; await img.decode();
  const w = Math.min(width, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL(mime, quality);
}, { b64: buf.toString('base64'), type: ext, width, quality, mime });
await browser.close();
await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
await fs.writeFile(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
const s = (await fs.stat(out)).size;
console.log(`${out}: ${(s / 1024).toFixed(0)} КБ`);
