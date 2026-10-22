// Безопасная зона в карточках: текст и значки не подходят к краю карточки/плашки/окна ближе порога.
//   node scripts/edge-check.mjs <файл.html|url> [ширина]   (без ширины — 1440 и 390)
//   --waits=1200,3500   моменты замера в каждой секции (мс после прокрутки к ней) — ловит состояния автоанимаций
//   --json=<файл>       сохранить нарушения в JSON
// Порог: 16 px на десктопе, 12 px при ширине < 700. Для маленьких плашек (высота < 56 или ширина < 120:
// кнопки, чипсы, бейджи, аватарки) проверяется только горизонталь с порогом 10 / 8 px.
// Контейнер — ближайший предок с фоном (цвет/картинка), рамкой (≥ 3 стороны), тенью или скруглением с фоном.
// Полноширинные поля (ширина ≥ окна − 2) и html/body контейнерами не считаются.
// Замер идёт в собственных координатах слоя: на время замера трансформации отключаются, поэтому повёрнутые
// и уменьшенные слои (изометрия, iPhone в масштабе) меряются по своей вёрстке (16 pt в устройстве = норма).
// Расстояние — от границы текста (Range по текстовым узлам) до внутреннего края рамки контейнера (padding box).
// Исключение: атрибут data-edge-ok на элементе или предке (например, подписи таб-бара iOS) — с объяснением в README.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; }));
const [target, wArg] = args.filter(a => !a.startsWith('--'));
if (!target) { console.error('usage: edge-check.mjs <файл|url> [ширина] [--waits=1200,3500] [--json=out.json]'); process.exit(1); }
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
const widths = wArg ? [Number(wArg)] : [1440, 390];
const waits = (flags.waits || '1200,3500').split(',').map(Number);

function measure(T) {
  const vw = Math.min(innerWidth, document.documentElement.clientWidth);
  const small = T >= 16 ? 10 : 8;
  const sel = el => {
    const one = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : (e.className && e.className.baseVal ? '.' + e.className.baseVal.split(/\s+/)[0] : ''));
    const parts = []; for (let e = el, i = 0; e && i < 3 && e !== document.body; e = e.parentElement, i++) parts.unshift(one(e));
    return parts.join(' > ');
  };
  const visible = el => {
    let op = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.contentVisibility === 'hidden') return false;
      op *= Number(s.opacity); if (op < 0.05) return false;
      if (e.hasAttribute('aria-hidden') && e.getAttribute('aria-hidden') === 'true' && e.hasAttribute('data-edge-skip')) return false;
    }
    return true;
  };
  const isContainer = e => {
    if (e === document.body || e === document.documentElement) return false;
    const r = e.getBoundingClientRect();
    if (r.width >= vw - 2 || r.width < 8 || r.height < 8) return false;
    const s = getComputedStyle(e);
    const bgA = (() => { const m = s.backgroundColor.match(/rgba?\(([^)]+)\)/); if (!m) return 0; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? Number(p[3]) : 1; })();
    const hasBg = bgA > 0.05 || (s.backgroundImage && s.backgroundImage !== 'none');
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(k => parseFloat(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none' && !/rgba\([^)]*,\s*0\)/.test(s['border' + k + 'Color'])).length;
    const shadow = s.boxShadow && s.boxShadow !== 'none';
    if (sides >= 3 || shadow || (s.backgroundImage && s.backgroundImage !== 'none')) return true;
    if (!hasBg) return false;
    // фон того же цвета, что под ним (изоляция для multiply и т. п.), карточку не образует
    for (let p = e.parentElement; p; p = p.parentElement) {
      const c = getComputedStyle(p).backgroundColor;
      if (c && !/rgba\([^)]*,\s*0\)|transparent/.test(c)) return c !== s.backgroundColor;
    }
    return true;
  };
  const textRect = el => {
    let L = Infinity, Tp = Infinity, R = -Infinity, B = -Infinity, any = false;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) { if (!q.width) continue; any = true; L = Math.min(L, q.left); Tp = Math.min(Tp, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); }
    }
    return any ? { left: L, top: Tp, right: R, bottom: B } : null;
  };
  const clippedAway = (el, r) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflowY)) {
        const q = p.getBoundingClientRect();
        if (r.right <= q.left + 1 || r.left >= q.right - 1 || r.bottom <= q.top + 1 || r.top >= q.bottom - 1) return true;
      }
    }
    return false;
  };
  const out = [];
  const items = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-edge-ok],script,style,noscript,head,.skip')) continue;
    const tag = el.tagName.toLowerCase();
    let r = null, kind = 'текст';
    if (tag === 'svg' || tag === 'img') {
      if (el.parentElement && el.parentElement.closest('svg')) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || b.width > 64 || b.height > 64) continue;
      r = b; kind = 'значок';
    } else if (!el.closest('svg')) r = textRect(el);
    if (!r || !visible(el) || clippedAway(el, r)) continue;
    items.push({ el, r, kind });
  }
  for (const { el, r, kind } of items) {
    let c = (kind === 'текст' && isContainer(el)) ? el : null;
    if (!c) for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (isContainer(p)) { c = p; break; }
    if (!c || c.closest('[data-edge-ok]')) continue;
    const cr = c.getBoundingClientRect(), cs = getComputedStyle(c);
    const inner = { left: cr.left + parseFloat(cs.borderLeftWidth), right: cr.right - parseFloat(cs.borderRightWidth), top: cr.top + parseFloat(cs.borderTopWidth), bottom: cr.bottom - parseFloat(cs.borderBottomWidth) };
    // элемент целиком за пределами контейнера (абсолютные подписи снаружи) — не про безопасную зону
    if (r.right < inner.left || r.left > inner.right || r.bottom < inner.top || r.top > inner.bottom) continue;
    const isSmall = cr.height < 56 || cr.width < 120;
    // круглая/квадратная кнопка или аватар со значком по центру — не про безопасную зону
    if (isSmall && Math.abs(cr.width - cr.height) <= Math.max(4, cr.height * 0.2) && Math.abs((r.left - inner.left) - (inner.right - r.right)) <= 2) continue;
    const d ={ слева: r.left - inner.left, справа: inner.right - r.right, сверху: r.top - inner.top, снизу: inner.bottom - r.bottom };
    const lim = isSmall ? small : T;
    const bad = Object.entries(d).filter(([k, v]) => (!isSmall || k === 'слева' || k === 'справа') && v < lim - 0.5);
    // скруглённый угол контейнера «съедает» место: угол текста должен лежать внутри дуги с запасом (текст в углу карточки не обрезается и не прилипает)
    if (!isSmall) {
      const rad = k => Math.min(parseFloat(cs[k]) || 0, cr.width / 2, cr.height / 2);   // радиус 999px у «таблеток» ограничен половиной размера
      const corners = [
        ['слева-сверху', rad('borderTopLeftRadius'), inner.left, inner.top, r.left, r.top, 1, 1],
        ['справа-сверху', rad('borderTopRightRadius'), inner.right, inner.top, r.right, r.top, -1, 1],
        ['слева-снизу', rad('borderBottomLeftRadius'), inner.left, inner.bottom, r.left, r.bottom, 1, -1],
        ['справа-снизу', rad('borderBottomRightRadius'), inner.right, inner.bottom, r.right, r.bottom, -1, -1]
      ];
      for (const [name, R, cx0, cy0, px, py, sx, sy] of corners) {
        if (R < 12) continue;
        const dx = (px - cx0) * sx, dy = (py - cy0) * sy;          // смещение угла текста от угла контейнера внутрь
        if (dx < R && dy < R) {                                     // угол текста попал в квадрат скругления
          const dist = Math.hypot(dx - R, dy - R);                  // расстояние до центра дуги
          const margin = R - dist;                                  // сколько до границы дуги (≥ 0 — внутри)
          if (margin < Math.min(T, 12)) bad.push([`угол ${name} (радиус ${Math.round(R)})`, margin]);
        }
      }
    }
    if (!bad.length) continue;
    const sec = el.closest('section[id],header,footer');
    out.push({
      section: sec ? (sec.id || sec.tagName.toLowerCase()) : '?',
      el: sel(el), container: sel(c), kind, small: isSmall, limit: lim,
      text: kind === 'текст' ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50) : (el.getAttribute('alt') || el.getAttribute('aria-label') || ''),
      sides: bad.map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')
    });
  }
  // безопасная зона экрана на мобильной ширине: контент не ближе SAFE (16 px) к краям окна; фоны на всю ширину и продолжение горизонтальных лент допустимы
  if (vw < 700) {
    const SAFE = 16, seenBox = new Set();
    const inScroller = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 2) return true; } return false; };
    for (const { el, r, kind } of items) {
      if (inScroller(el)) continue;
      let c = null; for (let p = (kind === 'текст' && isContainer(el)) ? el : el.parentElement; p && p !== document.body; p = p.parentElement) if (isContainer(p)) { c = p; break; }
      const box = c ? c.getBoundingClientRect() : r;
      const target = c || el;
      if (seenBox.has(target)) continue;
      const left = box.left, right = vw - box.right;
      if (left >= SAFE - 0.5 && right >= SAFE - 0.5) continue;
      if (c && box.width >= vw - 2) { /* карточка на всю ширину: проверяем сам текст */ if (r.left >= SAFE - 0.5 && vw - r.right >= SAFE - 0.5) continue; }
      seenBox.add(target);
      const sec = el.closest('section[id],header,footer');
      out.push({ section: sec ? (sec.id || sec.tagName.toLowerCase()) : '?', el: sel(el), container: sel(target), kind: 'край экрана', small: false, limit: SAFE,
        text: (el.textContent || el.getAttribute('alt') || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        sides: `слева ${Math.round(left)}, справа ${Math.round(right)} от края экрана` });
    }
  }
  return out;
}

const all = [];
const browser = await chromium.launch();
for (const width of widths) {
  const T = width < 700 ? 12 : 16;
  const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 }, isMobile: width < 700, hasTouch: width < 700 });
  await page.goto(url, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1500);
  const ids = await page.$$eval('header, section[id], footer', els => els.map((e, i) => { e.dataset.edgeIdx = i; return i; }));
  const seen = new Map();
  for (const i of ids) {
    const h = await page.$(`[data-edge-idx="${i}"]`);
    await h.scrollIntoViewIfNeeded().catch(() => {});
    let last = 0;
    for (const w of waits) {
      await page.waitForTimeout(Math.max(0, w - last)); last = w;
      const res = await page.evaluate(([T, i, src]) => {
        const st = document.createElement('style'); st.id = '__edge';
        st.textContent = '*,*::before,*::after{transform:none!important;translate:none!important;rotate:none!important;scale:none!important;transition:none!important}';
        document.head.appendChild(st);
        let r;
        try { r = (0, eval)('(' + src + ')')(T); } finally { st.remove(); }
        const host = document.querySelector(`[data-edge-idx="${i}"]`);
        const id = host.id || host.tagName.toLowerCase();
        return r.filter(o => o.section === id);
      }, [T, i, measure.toString()]);
      for (const o of res) { const k = o.el + '|' + o.text + '|' + o.sides.split(' ')[0]; if (!seen.has(k)) seen.set(k, o); }
    }
  }
  for (const o of seen.values()) all.push({ width, ...o });
  await page.close();
}
await browser.close();

for (const width of widths) {
  const list = all.filter(o => o.width === width);
  console.log(`\n== ${width} px: нарушений ${list.length} (порог ${width < 700 ? 12 : 16} px; малые плашки ${width < 700 ? 8 : 10} px по горизонтали)`);
  for (const o of list) console.log(`  [${o.section}] ${o.kind} «${o.text}» — ${o.sides} px\n      элемент: ${o.el}\n      контейнер${o.small ? ' (малая плашка)' : ''}: ${o.container}`);
}
console.log(`\nИтого нарушений: ${all.length}`);
if (flags.json) await fs.writeFile(flags.json, JSON.stringify(all, null, 2), 'utf8');
process.exitCode = all.length ? 1 : 0;
