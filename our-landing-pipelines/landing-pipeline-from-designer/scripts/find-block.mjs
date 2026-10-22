// Находит на странице блок по тексту заголовка и снимает его (для сравнения блоков разных лендингов).
// node scripts/find-block.mjs <file.html> "<часть заголовка>" <out.png> [--width=1440] [--wait=4000]
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [file, text, out] = args.filter(a => !a.startsWith('--'));
if (!file || !text || !out) { console.error('usage: find-block.mjs <file.html> "<текст>" <out.png>'); process.exit(1); }
const width = Number(flags.width || 1440), wait = Number(flags.wait || 4000);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.goto(pathToFileURL(path.resolve(file)).href);
await page.waitForTimeout(2000);
const handle = await page.evaluateHandle(t => {
  const norm = s => s.replace(/\s+/g, ' ').replace(/ /g, ' ').trim();
  const h = [...document.querySelectorAll('h1,h2,h3')].find(e => norm(e.textContent).includes(t));
  return h ? (h.closest('section') || h.parentElement) : null;
}, text);
const el = handle.asElement();
if (!el) { console.error('не найден блок с заголовком: ' + text); await browser.close(); process.exit(2); }
await el.scrollIntoViewIfNeeded();
await page.waitForTimeout(wait);
await el.screenshot({ path: out });
console.log(out);
await browser.close();
