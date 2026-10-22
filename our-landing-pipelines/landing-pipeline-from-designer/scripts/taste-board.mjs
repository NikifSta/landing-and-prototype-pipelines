// Доска вкуса: карточки референсов с первым экраном, настроением и ссылкой, чтобы пользователь выбрал «нравится / не нравится».
// node scripts/taste-board.mjs <out.html> <ref1,ref2,...> [--title="..."] [--png]
//   --png  дополнительно снять доску в PNG (для просмотра без браузера)
// Карточки берут скриншот из references/shots/<ref>/ (первый подходящий png) и данные языка из references/_archetypes/part-*.languages.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
let [out, refsArg] = args.filter(a => !a.startsWith('--'));
if (flags.recipes && !refsArg) refsArg = 'recipes';   // режим доски рецептов: --recipes=projects/<slug>
if (!out || !refsArg) { console.error('usage: taste-board.mjs <out.html> <ref1,ref2,...> [--title=...] [--png]'); process.exit(1); }
const langs = [];
for (const f of (await fs.readdir(path.join(ROOT, 'references/_archetypes'))).filter(f => f.endsWith('.languages.json'))) {
  try { langs.push(...JSON.parse((await fs.readFile(path.join(ROOT, 'references/_archetypes', f), 'utf8')).replace(/^﻿/, ''))); } catch {}
}
// «auto»: набор из N максимально разных по палитре и шрифту референсов, не повторяющих недавно использованные
let refs, recipes = null;
if (flags.recipes) {
  // доска рецептов: карточка = кандидат A/B/C; главная картинка — страница-донор ЯЗЫКА (палитра, шрифт, настроение), отдельно подписан донор первого экрана
  recipes = [];
  for (const L of ['A', 'B', 'C', 'D']) { try { recipes.push([L, JSON.parse((await fs.readFile(path.join(String(flags.recipes), `recipe-${L}.json`), 'utf8')).replace(/^﻿/, ''))]); } catch {} }
  refs = recipes.map(([, r]) => r.language.ref);
} else if (refsArg === 'auto') {
  const n = Number(flags.n || 8), seed = [...String(flags.seed || Date.now())].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  let s = seed; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  let recent = new Set();
  try { const reg = JSON.parse((await fs.readFile('projects/_registry.json', 'utf8')).replace(/^﻿/, '')); recent = new Set(reg.recipes.slice(-4).map(r => r.language?.ref)); } catch {}
  const withShot = [];
  const NO_BOARD = new Set(['alethia', 'streamtime', 'trevornoah', 'holdi-focus']); // непоказательные кадры: почти чёрный экран загрузки, узкая полоса, cookie-баннер
  for (const l of langs) if (l.origin !== 'studio' && !NO_BOARD.has(l.ref) && await findShot(l.ref)) withShot.push(l);
  const pool = withShot.filter(l => !recent.has(l.ref)).sort(() => rnd() - 0.5);
  const chosen = [], seenP = new Set(), seenT = new Set();
  for (const pass of [0, 1, 2]) for (const l of pool) {
    if (chosen.length >= n || chosen.includes(l)) continue;
    const p = String(l.palette_family).split('|')[0].trim(), t = String(l.type_class).split('|')[0].trim();
    if (pass === 0 && (seenP.has(p) || seenT.has(t))) continue;
    if (pass === 1 && seenP.has(p)) continue;
    chosen.push(l); seenP.add(p); seenT.add(t);
  }
  refs = chosen.map(l => l.ref);
} else {
  refs = refsArg.split(',').map(s => s.trim()).filter(Boolean);
}
async function findShot(ref) {
  // сначала лёгкое превью из репозитория (references/thumbs), затем полные скриншоты, если они есть локально
  const thumb = path.join(ROOT, 'references/thumbs', ref + '.jpg');
  try { await fs.access(thumb); return thumb; } catch {}
  const base = path.join(ROOT, 'references/shots', ref === 'structured-app' ? 'structured' : ref);
  for (const sub of ['shots', '.', 'frames']) {
    try {
      const files = (await fs.readdir(path.join(base, sub))).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort((a, b) => (/0-desktop/.test(b) ? 1 : 0) - (/0-desktop/.test(a) ? 1 : 0) || a.localeCompare(b));
      if (files.length) return path.join(base, sub, files[0]);
    } catch {}
  }
  return null;
}
const url = p => pathToFileURL(p).href;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cards = [], links = [];
for (const [i, ref] of refs.entries()) {
  const l = langs.find(x => x.ref === ref) || {};
  const shot = await findShot(ref);
  let site = ''; try { site = (await fs.readFile(path.join(ROOT, 'references', ref + '.md'), 'utf8')).match(/\*\*URL:\*\*\s*(\S+)/)?.[1] || ''; } catch {}
  const rc = recipes?.[i]?.[1];
  const extra = rc ? `<p class="t">Движение: ${esc(rc.motion_signature)} · образность: ${esc(rc.imagery_primary)}</p><p class="t">Первый экран: ${esc(rc.sections[0]?.name || '')}${rc.sections[0]?.donors?.[0] ? ' (по мотивам ' + esc(rc.sections[0].donors[0]) + ')' : ''}</p><p class="t">Ещё в странице: ${esc(rc.sections.slice(1).map(s => s.name).filter(Boolean).slice(0, 4).map(n => n.length > 38 ? n.slice(0, 36) + '…' : n).join(' · '))}</p>` : '';
  cards.push(`<article><div class="n">${recipes ? recipes[i][0] : flags.letters ? String.fromCharCode(65 + i) : i + 1}</div><div class="shot">${shot ? `<img src="${url(shot)}" alt="">` : '<span>нет скриншота</span>'}</div>
  <h3>${esc(ref)}</h3><p class="m">${esc([].concat(l.mood || []).join(', '))}</p>${extra}
  <p class="t">${esc(String(l.palette_family || '').split('|')[0])} · ${esc(String(l.type_class || '').split('|')[0])} · плотность ${esc(String(l.density || '').split('|')[0])}</p>
  ${site ? `<p class="u"><a href="${esc(site)}" target="_blank" rel="noopener">${esc(site)}</a></p>` : ''}</article>`);
  links.push(`${recipes ? recipes[i][0] : flags.letters ? String.fromCharCode(65 + i) : i + 1}. ${ref} — ${site || 'ссылки нет'} — ${[].concat(l.mood || []).join(', ')}`);
}
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(flags.title || 'Доска вкуса')}</title>
<style>body{margin:0;background:#F6F7F5;color:#111214;font:16px/1.45 Inter,system-ui,sans-serif;padding:32px}h1{font:800 32px/1.1 system-ui;margin:0 0 6px}.s{color:#5E6366;margin:0 0 24px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:24px}article{position:relative;background:#fff;border-radius:16px;padding:14px 14px 18px;box-shadow:0 8px 24px -14px rgba(17,18,20,.35)}
.n{position:absolute;left:22px;top:22px;z-index:2;background:#111214;color:#fff;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:700}
.shot{height:230px;overflow:hidden;border-radius:10px;background:#E9ECE8;display:grid;place-items:center;color:#8A9094}.shot img{width:100%;height:100%;object-fit:cover;object-position:top}
h3{margin:12px 0 2px;font-size:20px}.m{margin:0;color:#111214}.t{margin:4px 0 0;color:#5E6366;font-size:14px}.u{margin:6px 0 0;color:#0B7D43;font-size:13px;word-break:break-all}</style></head>
<body><h1>${esc(flags.title || 'Что вам нравится?')}</h1><p class="s">${recipes ? 'Картинка показывает визуальный язык варианта (цвет, шрифт, настроение), а не готовую страницу. Выберите букву: A, B или C.' : 'Назовите номера: что нравится, что не нравится, и что именно (первый экран, цвет, шрифт, движение, картинки).'}</p><div class="g">${cards.join('')}</div></body></html>`;
await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
await fs.writeFile(out, html, 'utf8');
console.log('Готово: ' + out);
// список «номер — сайт — ссылка — настроение»: показывай его пользователю вместе с картинкой, чтобы он мог зайти и полазить по сайту
console.log('Ссылки для сообщения пользователю:\n' + links.join('\n'));
await fs.writeFile(out.replace(/\.html$/, '-links.md'), links.map(x => '- ' + x).join('\n') + '\n', 'utf8');
if (flags.png) {
  const { chromium } = await import('playwright');
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
  await pg.goto(pathToFileURL(path.resolve(out)).href); await pg.waitForTimeout(1500);
  const png = out.replace(/\.html$/, '.png'); await pg.screenshot({ path: png, fullPage: true }); await b.close(); console.log('PNG: ' + png);
}
