// Скриншоты HTML-страницы в двух размерах (1440 и 390) и проверка горизонтальной прокрутки.
// node scripts/shots.mjs <файл.html> <папка для png> [имя]
// Результат: <папка>/<имя>-1440.png, <имя>-390.png и строка «scrollWidth» (должна быть 1440 и 390).
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rawArgs = process.argv.slice(2);
const flags = Object.fromEntries(rawArgs.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [file, outDir, nameArg] = rawArgs.filter(a => !a.startsWith('--'));
// --wait=мс — пауза после загрузки (по умолчанию 3500); для итогового состояния автосцен поставьте больше длительности цикла
if (!file || !outDir) { console.error('usage: shots.mjs <file.html> <outDir> [name]'); process.exit(1); }
const name = nameArg || path.basename(file, path.extname(file));
await fs.mkdir(outDir, { recursive: true });
const url = pathToFileURL(path.resolve(file)).href;
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url);
  await page.waitForTimeout(Number(flags.wait || 3500)); // шрифты и автоанимации
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`${name} ${w}: scrollWidth ${sw}${sw > w ? '  ← ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА' : ''}`);
  await page.screenshot({ path: path.join(outDir, `${name}-${w}.png`), fullPage: true });
  await page.close();
}
await browser.close();
