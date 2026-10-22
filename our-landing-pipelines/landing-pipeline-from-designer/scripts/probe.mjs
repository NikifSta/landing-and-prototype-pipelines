// Выполнить JavaScript на странице и вывести результат (замеры без самодельных скриптов).
// node scripts/probe.mjs <file.html|url> "<выражение>" [--width=1440] [--wait=2500] [--scroll=#id]
// Примеры:
//   позиции секций:  node scripts/probe.mjs site/index.html "[...document.querySelectorAll('section[id]')].map(s=>[s.id,Math.round(s.getBoundingClientRect().top+scrollY),Math.round(s.offsetHeight)])" --width=390
//   высота элемента: node scripts/probe.mjs 07-ui/03-x.html "document.querySelector('.tile').offsetHeight"
//   мин. размер шрифта в масштабированном экране: node scripts/probe.mjs f.html "Math.min(...[...document.querySelectorAll('.phone *')].map(e=>{const r=e.getBoundingClientRect();return e.childNodes.length&&r.width? parseFloat(getComputedStyle(e).fontSize)*r.width/e.offsetWidth:99}))"
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; }));
const [target, expr] = args.filter(a => !a.startsWith('--'));
if (!target || !expr) { console.error('usage: probe.mjs <file|url> "<выражение>" [--width=1440] [--wait=2500] [--scroll=#id]'); process.exit(1); }
const width = Number(flags.width || 1440);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 }, isMobile: width < 700 });
await page.goto(/^https?:/.test(target) ? target : pathToFileURL(path.resolve(target)).href);
await page.waitForTimeout(Number(flags.wait || 2500));
if (flags.scroll) { await page.evaluate(sel => document.querySelector(sel)?.scrollIntoView(), flags.scroll); await page.waitForTimeout(800); }
try { console.log(JSON.stringify(await page.evaluate(expr), null, 2)); }
catch (e) { console.error('ошибка выражения: ' + e.message.split('\n')[0]); process.exitCode = 2; }
await browser.close();
