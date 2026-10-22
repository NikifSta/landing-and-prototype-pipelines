// Автопроверка страницы: скриншоты 1440/390, переполнения, наложения, битые картинки, висячие предлоги, ошибки консоли.
// node scripts/qa.mjs <file.html|url> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const [target, outArg] = process.argv.slice(2);
if (!target) { console.error('usage: qa.mjs <file|url> [outDir]'); process.exit(1); }
const outDir = outArg || path.join(path.dirname(target), 'qa');
await fs.mkdir(outDir, { recursive: true });
const url = /^https?:/.test(target) ? target : 'file://' + path.resolve(target);

const browser = await chromium.launch();
const report = {};
// 1440 и 390 проверяются одновременно (в двух страницах одного браузера): экономит около половины времени
await Promise.all([['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]].map(async ([tag, vp]) => {
  const page = await browser.newPage({ viewport: vp });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, `${tag}.png`), fullPage: true });
  const res = await page.evaluate(() => {
    const vw = window.innerWidth, out = { hScroll: document.documentElement.scrollWidth > vw + 1, overflow: [], overlaps: [], brokenImages: [], hanging: [] };
    // видимость с учётом прозрачности родителей (слои, которые сменяют друг друга через opacity, не считаются наложением)
    const vis = el => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') return false;
      let o = 1; for (let p = el; p && p !== document.documentElement; p = p.parentElement) o *= +getComputedStyle(p).opacity; return o > 0.05; };
    const sel = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''));
    document.querySelectorAll('body *').forEach(el => {
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 2 || r.left < -2) && getComputedStyle(el).position !== 'fixed') {
        let p = el.parentElement, clipped = false;
        while (p) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') { clipped = true; break; } p = p.parentElement; }
        if (!clipped) out.overflow.push(sel(el));
      }
    });
    const texts = [...document.querySelectorAll('h1,h2,h3,h4,p,a,button,li,span')].filter(el => vis(el) && el.children.length === 0 && el.innerText.trim());
    // видимая часть элемента с учётом обрезки родителями (overflow: hidden/clip/auto)
    const clipRect = el => { let r = el.getBoundingClientRect(), x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom, p = el.parentElement;
      while (p && p !== document.body) { const s = getComputedStyle(p); if (/(hidden|clip|auto|scroll)/.test(s.overflow + s.overflowX + s.overflowY)) { const q = p.getBoundingClientRect(); x1 = Math.max(x1, q.left); y1 = Math.max(y1, q.top); x2 = Math.min(x2, q.right); y2 = Math.min(y2, q.bottom); } p = p.parentElement; }
      return { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 }; };
    // фиксированные шапка и футер «под страницей» не считаются наложением
    const inFixed = el => { for (let p = el; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return true; return false; };
    const boxes = texts.filter(el => !inFixed(el)).map(el => ({ el, r: clipRect(el) })).filter(b => b.r.width > 0 && b.r.height > 0);
    // намеренные слои не считаются: aria-hidden, сменяющиеся состояния (.stack) и пары с одинаковым текстом (две половины шва «было/стало»)
    const layered = el => !!el.closest('[aria-hidden="true"], .stack');
    const seenPairs = new Set(); out.overlapsTotal = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (boxes[i].el.contains(boxes[j].el) || boxes[j].el.contains(boxes[i].el)) continue;
      const ta = boxes[i].el.innerText.trim(), tb = boxes[j].el.innerText.trim();
      if (ta === tb || layered(boxes[i].el) || layered(boxes[j].el)) continue;
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 6 && iy > 6) {
        out.overlapsTotal++;
        const key = sel(boxes[i].el) + '|' + sel(boxes[j].el);   // одинаковые по классам пары (строки списка) показываем один раз
        if (seenPairs.has(key) || out.overlaps.length >= 40) continue; seenPairs.add(key);
        out.overlaps.push(`${sel(boxes[i].el)} «${ta.slice(0, 30)}» × ${sel(boxes[j].el)} «${tb.slice(0, 30)}»`);
      }
    }
    // контраст текста кнопок и ссылок с эффективным фоном (ловит «чёрное на чёрном»); элементы поверх картинок и градиентов пропускаются
    out.lowContrast = [];
    const lumRgb = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const parse = s => (s.match(/[\d.]+/g) || []).map(Number);
    document.querySelectorAll('a, button').forEach(el => {
      if (!vis(el) || !el.innerText.trim()) return;
      let bg = null, skip = false;
      for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.backgroundImage !== 'none') { skip = true; break; }
        const c = parse(cs.backgroundColor); if (c.length && (c[3] ?? 1) > 0.9) { bg = c; break; }
      }
      if (skip) return; if (!bg) bg = [255, 255, 255];
      const fg = parse(getComputedStyle(el).color); if (fg.length < 3) return;
      const L1 = lumRgb(fg), L2 = lumRgb(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (ratio < 3) out.lowContrast.push(`${sel(el)} «${el.innerText.trim().slice(0, 30)}» контраст ${ratio.toFixed(1)}:1`);
    });
    out.lowContrast = out.lowContrast.slice(0, 20);
    // логотип: знак и название стоят на одной вертикальной оси (центры по высоте отличаются не больше чем на 2,5 px)
    out.logoMisaligned = [];
    document.querySelectorAll('header a, nav a, .logo, .brand, [class*="logo"], [class*="brand"]').forEach(a => {
      const mark = a.querySelector('svg, img'); if (!mark || !vis(a)) return;
      const mr = mark.getBoundingClientRect(); if (!mr.width || mr.height > 80) return;
      let T1 = Infinity, B1 = -Infinity;
      const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { if (!n.textContent.trim() || n.parentElement.closest('svg')) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) { if (q.width) { T1 = Math.min(T1, q.top); B1 = Math.max(B1, q.bottom); } } }
      if (!isFinite(T1)) return;
      const d = Math.abs((mr.top + mr.bottom) / 2 - (T1 + B1) / 2);
      if (d > 2.5) out.logoMisaligned.push(`${sel(a)}: центр знака и названия расходятся на ${d.toFixed(1)} px`);
    });
    document.querySelectorAll('img').forEach(img => { if (img.complete && img.naturalWidth === 0) out.brokenImages.push(img.src.slice(0, 120)); });
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    // по отрисовке: короткое слово (1–2 буквы) стоит в конце строки, а следующее слово ушло на новую
    const rectOf = (node, a, b) => { const rg = document.createRange(); rg.setStart(node, a); rg.setEnd(node, b); const rs = rg.getClientRects(); return rs.length ? rs[0] : null; };
    while ((n = w.nextNode())) {
      if (/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) || !vis(n.parentNode)) continue;
      for (const m of n.nodeValue.matchAll(/(^|[\s («])([а-яёa-z]{1,2}) (?=\S)/gi)) {
        const s = m.index + m[1].length, e = s + m[2].length;
        const a = rectOf(n, s, e), b = rectOf(n, e + 1, e + 2);
        if (a && b && b.top > a.top + a.height / 2) out.hanging.push(`«${m[2]}» в конце строки: ${n.nodeValue.trim().slice(0, 50)}`);
      }
    }
    // одно слово на последней строке абзаца или заголовка (от 4 слов)
    out.widows = [];
    document.querySelectorAll('h1,h2,h3,p,li,summary').forEach(el => {
      if (!vis(el) || inFixed(el) || el.innerText.trim().split(/\s+/).length < 4) return;
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const nodes = []; let t; while ((t = tw.nextNode())) if (t.nodeValue.trim()) nodes.push(t);
      const last = nodes[nodes.length - 1]; if (!last) return;
      const txt = last.nodeValue.replace(/\s+$/, ''), sp = Math.max(txt.lastIndexOf(' '), txt.lastIndexOf('\n'));
      if (sp < 1 || txt.slice(sp + 1).includes(' ')) return; // последняя строка — склейка из 2+ слов, это нормально
      const a = rectOf(last, sp - 1, sp), b = rectOf(last, sp + 1, sp + 2);
      if (a && b && b.top > a.top + a.height / 2) out.widows.push(el.innerText.trim().slice(-50));
    });
    out.widows = out.widows.slice(0, 30);
    out.hanging = out.hanging.slice(0, 30);
    return out;
  });
  // Стабильность: пока в блоке идут автоанимации (10 с), ни секция, ни плитка-подложка не должны менять высоту
  console.error(`[qa] ${tag}: статические проверки готовы, начинаю замер высот блоков (10 с на секцию, это самая долгая часть)…`);
  res.jumps = await page.evaluate(async () => {
    const out = [], desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    for (const s of document.querySelectorAll('main section, body > section')) {
      s.scrollIntoView({ block: 'start', behavior: 'instant' });
      await new Promise(r => setTimeout(r, 50));
      const els = [s, ...s.querySelectorAll('.tile, [data-stable]')], base = els.map(e => e.getBoundingClientRect().height), max = els.map(() => 0);
      for (let t = 0; t < 40; t++) { await new Promise(r => setTimeout(r, 250)); els.forEach((e, i) => { max[i] = Math.max(max[i], Math.abs(e.getBoundingClientRect().height - base[i])); }); }
      const h = (s.querySelector('h1,h2') || {}).innerText || '';
      els.forEach((e, i) => { if (max[i] > 1) out.push(`${desc(e)} («${h.trim().slice(0, 40)}»): высота менялась на ${Math.round(max[i])} px`); });
    }
    return out;
  });
  console.error(`[qa] ${tag}: готово`);
  report[tag] = { ...res, errors };
  await page.close();
}));
await browser.close();
const md = ['# QA-отчёт', ''];
for (const [tag, r] of Object.entries(report)) {
  md.push(`## ${tag}`, `- Горизонтальная прокрутка: ${r.hScroll ? 'ЕСТЬ' : 'нет'}`,
    `- Вылезают за экран: ${r.overflow.length}`, ...r.overflow.slice(0, 15).map(x => `  - ${x}`),
    `- Наложения текста: ${r.overlapsTotal ?? r.overlaps.length} (в списке уникальные пары; слои aria-hidden, .stack и пары с одинаковым текстом не считаются)`, ...r.overlaps.map(x => `  - ${x}`),
    `- Кнопки и ссылки с низким контрастом (< 3:1): ${(r.lowContrast || []).length}`, ...(r.lowContrast || []).map(x => `  - ${x}`),
    `- Знак и название логотипа не на одной оси: ${(r.logoMisaligned || []).length}`, ...(r.logoMisaligned || []).map(x => `  - ${x}`),
    `- Битые картинки: ${r.brokenImages.length}`, ...r.brokenImages.map(x => `  - ${x}`),
    `- Висячие короткие слова: ${r.hanging.length}`, ...r.hanging.slice(0, 10).map(x => `  - ${x}`),
    `- Одно слово на последней строке: ${r.widows.length}`, ...r.widows.slice(0, 10).map(x => `  - …${x}`),
    `- Блоки меняют высоту во время анимации: ${r.jumps.length}`, ...r.jumps.map(x => `  - ${x}`),
    `- Ошибки JS: ${r.errors.length}`, ...r.errors.map(x => `  - ${x}`), '');
}
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(outDir, 'report.md'), md.join('\n'));
console.log(md.join('\n'));
