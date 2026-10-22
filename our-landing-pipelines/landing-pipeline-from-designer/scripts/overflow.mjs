// Какие элементы вызывают горизонтальную прокрутку.
// node scripts/overflow.mjs <файл.html|url> [ширина=390]
// Печатает элементы, правый край которых выходит за окно (и не обрезан родителем с overflow), самые широкие первыми.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [target, wArg] = process.argv.slice(2);
if (!target) { console.error('usage: overflow.mjs <файл|url> [ширина=390]'); process.exit(1); }
const width = Number(wArg) || 390;
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 600, hasTouch: width < 600 });
await page.goto(url, { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(1200);
const res = await page.evaluate(() => {
  const vw = innerWidth, out = [];
  const sel = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (!r.width || s.display === 'none' || s.position === 'fixed') continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let clipped = false;
    for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (/(hidden|auto|scroll|clip)/.test(o)) { clipped = true; break; } }
    if (!clipped) out.push({ el: sel(el), right: Math.round(r.right), left: Math.round(r.left), width: Math.round(r.width), text: (el.children.length ? '' : el.innerText || '').trim().slice(0, 40) });
  }
  return { scrollWidth: document.documentElement.scrollWidth, vw, out: out.sort((a, b) => b.right - a.right).slice(0, 25) };
});
await browser.close();
console.log(`scrollWidth ${res.scrollWidth} при окне ${res.vw}${res.scrollWidth > res.vw + 1 ? ' — ЕСТЬ горизонтальная прокрутка' : ' — прокрутки нет'}`);
for (const o of res.out) console.log(`  ${o.el}: слева ${o.left}, справа ${o.right}, ширина ${o.width}${o.text ? ' «' + o.text + '»' : ''}`);
