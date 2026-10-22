// Кадры из видео (в т.ч. ручной записи экрана .mp4) без ffmpeg — через установленный Edge/Chrome.
// node scripts/video-frames.mjs <video> <outDir> [шаг, с = 1] [ширина кадра = 720] [кадров на лист = 12]
// Результат: outDir/f-0001.jpg… (кадр каждые N секунд) и outDir/sheet-01.jpg… (листы-сетки по 12 кадров с метками времени).
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [video, outDir, stepArg, widthArg, perSheetArg] = process.argv.slice(2);
if (!video || !outDir) { console.error('usage: video-frames.mjs <video> <outDir> [stepSec] [width] [perSheet]'); process.exit(1); }
const step = Number(stepArg) || 1, width = Number(widthArg) || 720, perSheet = Number(perSheetArg) || 12;
await fs.mkdir(outDir, { recursive: true });

// Chromium из Playwright не умеет H.264, поэтому берём системный Edge, а если его нет — Chrome
let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch {}
}
if (!browser) { console.error('Нужен установленный Edge или Chrome'); process.exit(1); }

const page = await browser.newPage();
page.setDefaultTimeout(60000);
// страница должна открываться как file://, иначе браузер не даст прочитать локальное видео
const tmpHtml = path.join(outDir, '_player.html');
await fs.writeFile(tmpHtml, `<body style="margin:0;background:#000"><video id="v" muted preload="auto" src="${pathToFileURL(path.resolve(video)).href}"></video></body>`);
await page.goto(pathToFileURL(path.resolve(tmpHtml)).href);
const meta = await page.evaluate(() => new Promise((res, rej) => {
  const v = document.getElementById('v');
  const done = () => res({ duration: v.duration, w: v.videoWidth, h: v.videoHeight });
  if (v.readyState >= 1) return done();
  v.onloadedmetadata = done;
  v.onerror = () => rej(new Error('видео не открылось (кодек?)'));
  setTimeout(() => rej(new Error('видео не загрузилось за 30 с')), 30000);
}));
const height = Math.round(width * meta.h / meta.w);
console.log(`${path.basename(video)}: ${meta.duration.toFixed(1)} с, ${meta.w}×${meta.h} → кадры ${width}×${height}, шаг ${step} с`);

// Пиксели локального видео нельзя читать через canvas (браузер считает его чужим источником),
// поэтому видео показывается в нужном размере, а кадр снимается скриншотом элемента.
await page.setViewportSize({ width, height });
await page.evaluate(({ width, height }) => {
  const v = document.getElementById('v');
  v.style.cssText = `display:block;width:${width}px;height:${height}px`;
}, { width, height });
const video_ = page.locator('#v');

// перемотка с таймаутом: если seeked не пришёл за 10 с, снимаем то, что есть, и идём дальше
const seek = (t) => page.evaluate((t) => new Promise((res) => {
  const v = document.getElementById('v');
  const timer = setTimeout(() => res(false), 10000);
  v.onseeked = () => { clearTimeout(timer); requestAnimationFrame(() => res(true)); };
  // перемотка на ту же позицию не вызывает seeked, поэтому сдвигаемся чуть вперёд
  v.currentTime = Math.max(t, 0.05);
}), t);

const frames = [];
for (let t = 0, i = 1; t < meta.duration; t += step, i++) {
  const name = `f-${String(i).padStart(4, '0')}.jpg`;
  if (!(await seek(t))) console.warn(`кадр ${t.toFixed(1)} с: перемотка не подтвердилась`);
  await video_.screenshot({ path: path.join(outDir, name), type: 'jpeg', quality: 80 });
  frames.push({ name, t });
  process.stdout.write(`\r${i} кадров`);
}
process.stdout.write('\n');

// листы-сетки: 4 колонки, подпись времени на каждом кадре
const cols = 4;
for (let s = 0; s * perSheet < frames.length; s++) {
  const chunk = frames.slice(s * perSheet, (s + 1) * perSheet);
  const html = `<body style="margin:0;background:#f0f;display:grid;grid-template-columns:repeat(${cols},${width}px);gap:4px">${
    chunk.map(f => `<div style="position:relative"><img src="${pathToFileURL(path.resolve(outDir, f.name)).href}" style="display:block;width:${width}px"><span style="position:absolute;left:6px;top:6px;background:#000;color:#fff;font:bold 22px sans-serif;padding:2px 6px">${f.t.toFixed(1)} с</span></div>`).join('')}</body>`;
  await page.setViewportSize({ width: cols * width + (cols - 1) * 4, height: 100 });
  await fs.writeFile(tmpHtml, html);
  await page.goto(pathToFileURL(path.resolve(tmpHtml)).href, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(outDir, `sheet-${String(s + 1).padStart(2, '0')}.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
}
await browser.close();
await fs.rm(tmpHtml, { force: true });
console.log(`Готово: ${frames.length} кадров, ${Math.ceil(frames.length / perSheet)} листов → ${outDir}`);
