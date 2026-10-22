// Лёгкие превью блоков референсов: полностраничный снимок режется на горизонтальные полосы (≈ экран 1440×864), JPEG 720 px.
// node scripts/make-block-thumbs.mjs [ref ...] [--max=6]   → references/blocks/<ref>/NN.jpg (+ index.json со смещениями)
// Тяжёлые снимки references/shots в релиз не попадают, а превью блоков весят ~25–45 КБ и дают субагентам вид блока донора.
// Пустые (белые/чёрные: не прогрузились) полосы пропускаются.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './_env.mjs';

const args = process.argv.slice(2);
const max = Number((args.find(a => a.startsWith('--max=')) || '--max=6').split('=')[1]);
const only = args.filter(a => !a.startsWith('--'));
const shotsDir = path.join(ROOT, 'references/shots'), outDir = path.join(ROOT, 'references/blocks');
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
let total = 0;
for (const ref of await fs.readdir(shotsDir)) {
  if (only.length && !only.includes(ref)) continue;
  const src = await findShot(path.join(shotsDir, ref)); if (!src) { console.log('нет снимка:', ref); continue; }
  const buf = await fs.readFile(src); const type = path.extname(src).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const slices = await page.evaluate(async ({ b64, type, max }) => {
    const img = new Image(); img.src = `data:image/${type};base64,${b64}`; await img.decode();
    const w = 720, scale = w / img.naturalWidth, srcH = Math.round(img.naturalWidth * 0.6), out = [];
    for (let y = 0; y < img.naturalHeight - srcH * 0.3 && out.length < max; y += srcH) {
      const h = Math.min(srcH, img.naturalHeight - y), c = document.createElement('canvas'); c.width = w; c.height = Math.round(h * scale);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, y, img.naturalWidth, h, 0, 0, c.width, c.height);
      // полоса «пустая», если почти все пиксели одного цвета (страница не прогрузилась)
      const d = ctx.getImageData(0, 0, c.width, c.height).data; let min = 255, mx = 0;
      for (let k = 0; k < d.length; k += 97 * 4) { const l = (d[k] + d[k + 1] + d[k + 2]) / 3; min = Math.min(min, l); mx = Math.max(mx, l); }
      if (mx - min < 12) continue;
      out.push({ y, url: c.toDataURL('image/jpeg', 0.7) });
    }
    return out;
  }, { b64: buf.toString('base64'), type, max });
  const dir = path.join(outDir, ref === 'structured' ? 'structured-app' : ref);
  await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true });
  const idx = [];
  for (const [i, s] of slices.entries()) {
    const f = `${String(i + 1).padStart(2, '0')}.jpg`; await fs.writeFile(path.join(dir, f), Buffer.from(s.url.split(',')[1], 'base64')); idx.push({ file: f, y: s.y });
  }
  await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify({ source: path.relative(ROOT, src), slices: idx }, null, 2));
  total += slices.length; console.log(`${ref}: ${slices.length} полос`);
}
await browser.close();
console.log(`Готово: ${total} превью блоков в ${outDir}`);
