// Скриншоты секций страницы по очереди (для просмотра длинного лендинга без сжатия).
// node scripts/section-shots.mjs <file.html> <outDir> [id1,id2,...] [--width=1440] [--wait=1800]
// Без списка id берёт все <section id> и <header>/<footer>. Для секций с автосценами увеличьте --wait.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [file, outDir, idsArg] = args.filter(a => !a.startsWith('--'));
if (!file || !outDir) { console.error('usage: section-shots.mjs <file.html> <outDir> [ids] [--width=1440] [--wait=1800]'); process.exit(1); }
const width = Number(flags.width || 1440), wait = Number(flags.wait || 1800);
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 }, isMobile: width < 700 });
await page.goto(pathToFileURL(path.resolve(file)).href);
await page.waitForTimeout(2500);
const ids = idsArg ? idsArg.split(',') : await page.$$eval('section[id]', els => els.map(e => e.id));
for (const id of ids) {
  const el = await page.$('#' + id);
  if (!el) { console.warn('нет #' + id); continue; }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(wait);
  const out = path.join(outDir, `sec-${id}-${width}.png`);
  await el.screenshot({ path: out });
  console.log(out);
}
await browser.close();
