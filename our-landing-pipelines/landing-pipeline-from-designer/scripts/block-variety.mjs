// Проверка однообразия блоков на собранной странице: «все секции построены одинаково» ловится механически.
// node scripts/block-variety.mjs <site/index.html> [--width=1440]
// Для каждой секции верхнего уровня считается сигнатура: фон (светлый/тёмный/цветной), есть ли крупная скруглённая «карточка»
// (светлый блок с радиусом ≥ 10 px на ≥ 35 % площади секции), число колонок сетки, число изображений. Повторы выводятся списком.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [file] = args.filter(a => !a.startsWith('--'));
if (!file) { console.error('usage: block-variety.mjs <file.html> [--width=1440]'); process.exit(1); }
const width = Number(flags.width || 1440);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.goto(pathToFileURL(path.resolve(file)).href);
await page.waitForTimeout(2500);
const rows = await page.evaluate(() => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = c => { const [r, g, b, a = 1] = c; return a < 0.05 ? null : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const bgOf = el => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length && (c[3] ?? 1) > 0.05) return c; } return [246, 247, 245, 1]; };
  const sections = [...document.querySelectorAll('main > section, body > section, main > div > section, .fragment > section, [data-fragment]')];
  const seen = new Set(); let list = sections.filter(s => !s.closest('footer') && !seen.has(s) && seen.add(s));
  list = list.filter(s => !list.some(o => o !== s && o.contains(s)));  // только внешние секции: вложенные фрагменты не считаются отдельно
  list = list.filter(s => s.getBoundingClientRect().height > 200);
  for (const [i, s] of list.entries()) if (s.matches('[data-fragment]') || !s.id) s.__t = i;
  return list.filter(s => s.getBoundingClientRect().height > 200).map(s => {
    const r = s.getBoundingClientRect(), area = r.width * r.height;
    // цветное поле может лежать внутри секции (контракт 08-ui: поля внутри фрагментов): если сама секция прозрачна, ищем потомка с фоном на ≥ 70 % её площади
    const own = rgb(getComputedStyle(s).backgroundColor), transparentOwn = !own.length || (own[3] ?? 1) < 0.05;
    let bg = bgOf(s);
    if (transparentOwn) {
      let best = null;
      for (const el of s.querySelectorAll('*')) {
        const b = el.getBoundingClientRect(); if (b.width * b.height < area * 0.7) continue;
        const c = rgb(getComputedStyle(el).backgroundColor); if (c.length && (c[3] ?? 1) > 0.9) { best = c; break; }
      }
      if (best) bg = best;
    }
    const L = lum(bg);
    const kind = L == null ? 'прозрачный' : L < 0.25 ? 'тёмный' : (Math.max(...bg.slice(0, 3)) - Math.min(...bg.slice(0, 3)) > (L > 0.8 ? 18 : 40) ? 'цветной' : 'светлый');  // бледное цветное поле (мятное, персиковое) — цветное, если оттенок заметен
    let card = false, cols = 1, imgs = s.querySelectorAll('img,video,canvas').length;
    for (const el of s.querySelectorAll('div,article,figure,form,section')) {
      const cs = getComputedStyle(el), b = el.getBoundingClientRect();
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      const c = rgb(cs.backgroundColor); const l = c.length ? lum(c) : null;
      if (radius >= 10 && b.width * b.height >= area * 0.35 && l != null && l > 0.85 && el !== s) { card = true; break; }
    }
    for (const el of s.querySelectorAll('*')) {
      const g = getComputedStyle(el).gridTemplateColumns, b = el.getBoundingClientRect();
      if (g && g !== 'none' && b.width * b.height >= area * 0.25) cols = Math.max(cols, g.split(' ').length);
    }
    const title = (s.querySelector('h1,h2,h3')?.textContent || s.id || '').trim().replace(/\s+/g, ' ').slice(0, 48);
    return { id: s.id || s.dataset.fragment || '', title, bg: kind, shade: bg.slice(0, 3).map(v => Math.round(v / 24)).join('-'), card, cols, imgs, signature: `${kind}|${card ? 'карточка' : 'без карточки'}|кол${Math.min(cols, 4)}` };
  });
});
await browser.close();
console.log(`Секций: ${rows.length}`);
for (const r of rows) console.log(`  ${r.title.padEnd(50)} ${r.signature}  изобр.${r.imgs}`);
const bySig = new Map(); for (const r of rows) bySig.set(r.signature, (bySig.get(r.signature) || 0) + 1);
const problems = [];
const cards = rows.filter(r => r.card).length;
if (cards > Math.max(3, Math.ceil(rows.length * 0.4))) problems.push(`${cards} из ${rows.length} секций построены как «светлая крупная карточка на фоне» — страница сойдётся к одной схеме (допустимо не больше ${Math.max(3, Math.ceil(rows.length * 0.4))})`);
for (const [sig, n] of bySig) if (n > Math.max(3, Math.ceil(rows.length * 0.35))) problems.push(`сигнатура «${sig}» у ${n} секций`);
let run = 1; for (let i = 1; i < rows.length; i++) { run = rows[i].signature === rows[i - 1].signature ? run + 1 : 1; if (run === 3) problems.push(`три секции подряд с сигнатурой «${rows[i].signature}» (около «${rows[i].title}»)`); }
const bgCount = new Map(); for (const r of rows) bgCount.set(r.bg, (bgCount.get(r.bg) || 0) + 1);
const [topBg, topN] = [...bgCount].sort((a, b) => b[1] - a[1])[0] || ['', 0];
// фирменная палитра может быть целиком тёмной (чёрный брендбук): тогда ритм задают оттенки полей, а не светлый/тёмный
const shades = new Set(rows.map(r => r.shade)), darkBrand = topBg === 'тёмный' && topN / rows.length >= 0.9;
if (darkBrand) console.log(`Фон: бренд целиком тёмный (${shades.size} оттенков полей у секций): ритм задают оттенки, акцентные поля и плотность; проверьте глазами, что соседние секции различаются, жёсткого порога нет`);
else if (rows.length >= 6 && topN / rows.length > 0.7) problems.push(`нет ритма фонов: ${topN} из ${rows.length} секций на «${topBg}» фоне (допустимо не больше 70 %); чередуйте цветные поля, тёмные и светлые блоки осмысленно`);
const noImg = rows.filter(r => r.imgs === 0).length; if (rows.length >= 6 && noImg === rows.length) problems.push('ни в одной секции нет изображений, видео или canvas: страница полностью из текста и интерфейса');
console.log(problems.length ? 'Однообразие: ПРОБЛЕМЫ\n  - ' + problems.join('\n  - ') : 'Однообразие: OK');
process.exit(problems.length ? 3 : 0);
