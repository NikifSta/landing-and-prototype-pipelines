// Лёгкие превью референсов для доски вкуса: первый экран каждого референса в JPEG 900 px шириной.
// node scripts/make-thumbs.mjs            (берёт references/shots/<ref>/…, пишет references/thumbs/<ref>.jpg)
// Тяжёлые скриншоты в репозиторий не кладём, превью весят ~60–120 КБ каждое.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './_env.mjs';

const shotsDir = path.join(ROOT, 'references/shots'), outDir = path.join(ROOT, 'references/thumbs');
await fs.mkdir(outDir, { recursive: true });
async function findShot(base) {
  for (const sub of ['shots', '.', 'frames']) {
    try {
      const files = (await fs.readdir(path.join(base, sub))).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort((a, b) => (/0-desktop/.test(b) ? 1 : 0) - (/0-desktop/.test(a) ? 1 : 0) || a.localeCompare(b));
      if (files.length) return path.join(base, sub, files[0]);
    } catch {}
  }
  return null;
}
const browser = await chromium.launch(); const page = await browser.newPage();
let n = 0;
const onlyRefs = process.argv.slice(2).filter(a => !a.startsWith('--'));   // node scripts/make-thumbs.mjs [ref ...]: без аргументов — все
for (const ref of await fs.readdir(shotsDir)) {
  if (onlyRefs.length && !onlyRefs.includes(ref)) continue;
  const src = await findShot(path.join(shotsDir, ref)); if (!src) { console.log('нет снимка:', ref); continue; }
  const buf = await fs.readFile(src); const type = path.extname(src).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const url = await page.evaluate(async ({ b64, type }) => {
    const img = new Image(); img.src = `data:image/${type};base64,${b64}`; await img.decode();
    const w = 900, scale = w / img.naturalWidth;
    const h = Math.min(Math.round(img.naturalHeight * scale), Math.round(w * 0.64)); // верх страницы, примерно 16:10
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, img.naturalWidth, h / scale, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.8);
  }, { b64: buf.toString('base64'), type });
  const out = path.join(outDir, (ref === 'structured' ? 'structured-app' : ref) + '.jpg');
  await fs.writeFile(out, Buffer.from(url.split(',')[1], 'base64')); n++;
  console.log(path.basename(out), ((await fs.stat(out)).size / 1024).toFixed(0) + ' КБ');
}
await browser.close();
console.log(`Готово: ${n} превью в ${outDir}`);
