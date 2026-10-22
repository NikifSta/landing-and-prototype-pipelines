// Отрисовка логотипа для проверки глазами: светлый и тёмный фон, большой размер и 24 px.
// node scripts/logo-preview.mjs <logo.svg> <out.png> [logo-dark.svg] [--bg=#F6F7F5] [--dark=#111214]
// Запускать из корня пайплайна (там playwright). Затем открыть out.png (Read) и посмотреть.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
// значение флага может содержать «=» (ссылка Google Fonts: ...css2?family=Unbounded:wght@500), поэтому делим только по первому «=»
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; }));
const [light, out, darkFile] = args.filter(a => !a.startsWith('--'));
if (!light || !out) { console.error('usage: logo-preview.mjs <logo.svg> <out.png> [logo-dark.svg]'); process.exit(1); }
const svgLight = await fs.readFile(light, 'utf8');
const svgDark = darkFile ? await fs.readFile(darkFile, 'utf8') : svgLight;
const bg = flags.bg || '#F6F7F5', dark = flags.dark || '#111214';
// --fonts=<ссылка Google Fonts css2>: подключить шрифт бренда, иначе надпись нарисуется запасным шрифтом
const fontLink = flags.fonts ? `<link rel="stylesheet" href="${flags.fonts}">` : '';
const html = `<!doctype html><meta charset="utf-8">${fontLink}
<style>body{margin:0;font:12px system-ui;color:#666}.row{display:flex;gap:40px;align-items:center;padding:24px}.l{background:${bg}}.d{background:${dark};color:#aaa}
.big svg{height:96px;width:auto}.s24 svg{height:24px;width:auto}.s40 svg{height:40px;width:auto}</style>
<div class="l"><div class="row"><div class="big">${svgLight}</div></div><div class="row"><div class="s40">${svgLight}</div><div class="s24">${svgLight}</div><span>40 и 24 px</span></div></div>
<div class="d"><div class="row"><div class="big">${svgDark}</div></div><div class="row"><div class="s40">${svgDark}</div><div class="s24">${svgDark}</div><span>40 и 24 px</span></div></div>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 100 } });
await page.setContent(html);
if (flags.fonts) await page.waitForLoadState('networkidle').catch(() => {});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
if (flags.family) {
  // --family=Имя: проверка, что шрифт бренда загрузился, а не подменён запасным
  const ok = await page.evaluate(name => [...document.fonts].some(x => x.family.replace(/["']/g, '') === name && x.status === 'loaded'), flags.family);
  console.log(ok ? 'Шрифт ' + flags.family + ': загружен' : 'ВНИМАНИЕ: шрифт ' + flags.family + ' НЕ загрузился, надпись нарисована запасным шрифтом');
}
await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`Готово: ${out}`);
