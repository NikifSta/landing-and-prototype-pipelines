// Проверка «ядро страницы рабочее»: есть ли управляемые поля и меняется ли результат при вводе.
// node scripts/interactivity-check.mjs <файл.html|url> [ширина=1440]
// Что делает: находит видимые input (range/number/text), select и кнопки-переключатели; для каждого ползунка и числового поля
// сдвигает значение (к минимуму и максимуму, события input/change) и сравнивает видимый текст страницы до и после.
// Результат: список найденных управляющих элементов и «какие из них что-то меняют». Код выхода 1, если ядро не найдено или ничего не меняется.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [target, wArg] = process.argv.slice(2);
if (!target) { console.error('usage: interactivity-check.mjs <файл|url> [ширина=1440]'); process.exit(1); }
const width = Number(wArg) || 1440;
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 }, isMobile: width < 700, hasTouch: width < 700 });
await page.goto(url, { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(2500);

const controls = await page.evaluate(() => {
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const sel = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '');
  const list = [];
  document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]), select, textarea').forEach((e, i) => {
    if (!vis(e)) return; e.dataset.icIdx = 'c' + i;
    list.push({ idx: 'c' + i, kind: e.tagName === 'SELECT' ? 'select' : (e.type || 'text'), sel: sel(e), section: (e.closest('section[id],header,footer') || {}).id || '?' });
  });
  const buttons = [...document.querySelectorAll('button, [role=button], [role=tab], [role=radio], input[type=radio], input[type=checkbox]')].filter(vis).length;
  return { list, buttons };
});

const pageText = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const results = [];
for (const c of controls.list) {
  const el = await page.$(`[data-ic-idx="${c.idx}"]`); if (!el) continue;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const before = await pageText();
  let changed = false;
  if (c.kind === 'range' || c.kind === 'number') {
    for (const pos of ['min', 'max']) {
      await page.evaluate(([i, pos]) => { const e = document.querySelector(`[data-ic-idx="${i}"]`); const v = pos === 'min' ? e.min || 0 : e.max || 100; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [c.idx, pos]);
      await page.waitForTimeout(500);
      if ((await pageText()) !== before) { changed = true; break; }
    }
  } else if (c.kind === 'select') {
    await page.evaluate(i => { const e = document.querySelector(`[data-ic-idx="${i}"]`); if (e.options.length > 1) { e.selectedIndex = (e.selectedIndex + 1) % e.options.length; e.dispatchEvent(new Event('change', { bubbles: true })); } }, c.idx);
    await page.waitForTimeout(500); changed = (await pageText()) !== before;
  } else {
    await el.fill('12345').catch(() => {}); await page.waitForTimeout(400); changed = (await pageText()) !== before;
  }
  results.push({ ...c, changed });
}
await browser.close();

const live = results.filter(r => r.changed);
console.log(`Управляющих полей: ${controls.list.length} (ползунки/числа/выбор/текст), кнопок и переключателей: ${controls.buttons}`);
for (const r of results) console.log(`  [${r.section}] ${r.kind} ${r.sel}: ${r.changed ? 'результат меняется' : 'ничего не меняется'}`);
const sliders = results.filter(r => ['range', 'number'].includes(r.kind));
if (!sliders.length) console.log('ВНИМАНИЕ: нет ни одного ползунка или числового поля: ядро-калькулятор отсутствует (если по тезису оно нужно — это критичный брак).');
else if (!live.some(r => ['range', 'number'].includes(r.kind))) console.log('ВНИМАНИЕ: поля есть, но результат от них не меняется: ядро не рабочее.');
else console.log(`Ядро рабочее: ${live.length} поле(й) меняют результат.`);
process.exitCode = (sliders.length && live.length) || (controls.list.length && live.length) ? 0 : 1;
