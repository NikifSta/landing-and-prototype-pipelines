// Кадры страницы при прокрутке «как у человека» (для pin/scrub-сцен, которые полный скриншот не показывает).
// node scripts/scroll-shots.mjs <file.html|url> <outDir> [width=1440] [height=900] [шаг в долях экрана=0.8] [пауза на кадр, мс=700]
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const [target, outDir, wArg, hArg, stepArg, waitArg] = process.argv.slice(2);
if (!target || !outDir) { console.error('usage: scroll-shots.mjs <file|url> <outDir> [w] [h] [step]'); process.exit(1); }
const width = Number(wArg) || 1440, height = Number(hArg) || 900, step = Number(stepArg) || 0.8;
const url = /^https?:/.test(target) ? target : 'file://' + path.resolve(target);
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600 });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
const heightNow = () => page.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
// высота страницы пересчитывается на каждом шаге: sticky/pin и ленивые блоки меняют её по ходу прокрутки
for (let y = 0; y < await heightNow(); y += Math.round(height * step)) {
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), y);
  await page.waitForTimeout(Number(waitArg) || 700);
  await page.screenshot({ path: path.join(outDir, `${String(i++).padStart(3, '0')}-y${y}.png`) });
}
await browser.close();
console.log(`Готово: ${i} кадров → ${outDir}`);
