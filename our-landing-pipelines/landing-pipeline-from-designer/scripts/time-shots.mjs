// Кадры страницы по времени (для автоанимаций):
//   node scripts/time-shots.mjs <url или путь к .html> <outDir> [мс через запятую=500,3000,7000] [--sel=#id] [--y=0] [--only=desktop|mobile]
//   --sel=#id  прокрутить к элементу (позиция считается отдельно для каждой ширины; рекомендуемый способ)
//   --y=px     прокрутить на заданную позицию (одинаковую для обеих ширин)
// Снимает 1440×900 и 390×844 в указанные моменты после загрузки DOM; счёт времени с момента прокрутки.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; }));
const [target, outDir, msArg] = args.filter(a => !a.startsWith('--'));
const y = Number(flags.y || 0);
if (!target || !outDir) { console.error('usage: time-shots.mjs <url|файл> <outDir> [ms,ms,ms] [--sel=#id] [--y=0] [--only=desktop|mobile]'); process.exit(1); }
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
const moments = (msArg || '500,3000,7000').split(',').map(Number);
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [tag, vp, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  if (flags.only && flags.only !== tag) continue;
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(1200); // шрифты и разметка
  if (flags.sel) {
    const ok = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.scrollIntoView({ block: 'start' }); return true; }, flags.sel);
    if (!ok) console.warn(`${tag}: не найден ${flags.sel}`);
  } else if (y) await page.evaluate(y => scrollTo(0, y), y);
  const t0 = Date.now();
  for (const ms of moments) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    await page.screenshot({ path: path.join(outDir, `${tag}-${ms}ms.png`) });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(`${tag}: ${moments.length} кадров${overflow ? ', ЕСТЬ горизонтальная прокрутка' : ''}`);
  await ctx.close();
}
await browser.close();
