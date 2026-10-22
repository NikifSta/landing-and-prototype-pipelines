// Разбор страницы-референса по коду: шрифты, кегли, цвета, сетка, секции, картинки и устройства, анимации.
// node scripts/inspect.mjs <url> <outDir> [--only=desktop|mobile]
// Результат: inspect.json (всё), summary.md (коротко для паспорта), css/ (все стили страницы), page.html.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadEnv } from './_env.mjs';
loadEnv(); // .env рабочей папки, затем корня плагина

const args = process.argv.slice(2);
const [url, outDir] = args.filter(a => !a.startsWith('--'));
const only = (args.find(f => f.startsWith('--only=')) || '').split('=')[1];
if (!url || !outDir) { console.error('usage: inspect.mjs <url> <outDir> [--only=desktop|mobile]'); process.exit(1); }
await fs.mkdir(path.join(outDir, 'css'), { recursive: true });
const proxy = process.env.PROXY;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { url, date: new Date().toISOString(), viewports: {} };

// --- разбор CSS-текста: @keyframes и правила, связанные со скроллом ---
function blocks(css, startRe) {
  const out = [];
  for (const m of css.matchAll(startRe)) {
    let i = css.indexOf('{', m.index), depth = 0, j = i;
    for (; j < css.length; j++) { if (css[j] === '{') depth++; else if (css[j] === '}' && --depth === 0) break; }
    out.push(css.slice(m.index, j + 1));
  }
  return out;
}
function cssMotion(css) {
  const keyframes = {};
  for (const b of blocks(css, /@(?:-webkit-)?keyframes\s+([\w-]+)/g)) {
    const name = b.match(/keyframes\s+([\w-]+)/)[1];
    keyframes[name] = b.replace(/\s+/g, ' ').slice(0, 600);
  }
  const rules = [];
  // простые правила: селектор { ... } с признаками анимации по скроллу
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const body = m[2];
    if (/animation-timeline|view-timeline|scroll-timeline|animation-range|timeline-scope/.test(body))
      rules.push({ selector: m[1].trim().slice(0, 200), body: body.replace(/\s+/g, ' ').trim().slice(0, 400) });
  }
  const anims = [];
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*\banimation(?:-name)?\s*:[^{}]*)\}/g))
    anims.push({ selector: m[1].trim().slice(0, 160), animation: (m[2].match(/animation(?:-name)?\s*:\s*([^;]+)/) || [])[1]?.trim().slice(0, 200) });
  return { keyframes, scrollRules: rules, animationRules: anims.slice(0, 300) };
}

for (const [tag, vp, mobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['mobile', { width: 390, height: 844 }, true],
].filter(([t]) => !only || t === only)) {
  const context = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  const cssFiles = new Map(); // url -> текст
  page.on('response', async r => {
    try { if ((r.headers()['content-type'] || '').includes('text/css')) cssFiles.set(r.url(), await r.text()); } catch {}
  });
  console.log(`[${tag}] открываю ${url}`);
  for (let attempt = 1; ; attempt++) {
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); break; }
    catch (e) {
      if (attempt >= 2) {
        // последний заход с мягким ожиданием; если и он не удался — понятное сообщение и код 2 (скилл: дальше цепочка прокси → архив → WebFetch → «не проверен»)
        try { await page.goto(url, { waitUntil: 'load', timeout: 90000 }); break; }
        catch (e2) { console.error(`СТРАНИЦА НЕ ОТКРЫЛАСЬ (${url}): ${String(e2.message || e2).split('\n')[0]}\nДальше: PROXY из .env → web.archive.org/web/2/<url> → WebFetch → пометка «не проверен».`); await browser.close().catch(() => {}); process.exit(2); }
      }
      console.warn(`[${tag}] networkidle не наступил, повтор`); await sleep(2000);
    }
  }
  // прокрутить всю страницу, чтобы подгрузились ленивые картинки и анимации
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += Math.round(vp.height * 0.7)) { await page.evaluate(y => window.scrollTo(0, y), y); await sleep(250); }
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(800);

  // анимации, которые реально есть на странице (Web Animations API), на нескольких позициях
  const liveAnims = new Map();
  for (const f of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    await page.evaluate(f => window.scrollTo(0, document.documentElement.scrollHeight * f), f); await sleep(400);
    const list = await page.evaluate(() => document.getAnimations().map(a => {
      const t = a.effect?.getTiming?.() || {}, el = a.effect?.target;
      const cls = el ? (typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '') : '';
      return {
        kind: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || '',
        timeline: a.timeline ? a.timeline.constructor.name : null,
        duration: t.duration, delay: t.delay, easing: t.easing,
        iterations: t.iterations === Infinity ? 'infinite' : t.iterations,
        target: el ? el.tagName.toLowerCase() + (cls ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : '') : '',
      };
    })).catch(() => []);
    for (const a of list) { const k = `${a.name}|${a.target}`; if (!liveAnims.has(k)) liveAnims.set(k, { ...a, atScroll: f }); }
  }
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(500);

  const data = await page.evaluate(() => {
    const W = innerWidth, round = n => Math.round(n);
    const vis = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const desc = el => {
      const cls = typeof el.className === 'string' ? el.className : el.getAttribute('class') || '';
      return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : '');
    };
    const absTop = el => round(el.getBoundingClientRect().top + scrollY);
    const all = [...document.querySelectorAll('body *')].filter(vis);

    // шрифты
    const fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family.replace(/"/g, '')} ${f.weight} ${f.style}`);

    // типографика: группы по стилю у элементов с собственным текстом
    const typo = new Map();
    for (const el of all) {
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (own.length < 2) continue;
      const s = getComputedStyle(el);
      const key = [s.fontFamily.split(',')[0].replace(/"/g, ''), s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing, s.textTransform].join(' | ');
      const g = typo.get(key) || { style: key, tags: new Set(), count: 0, chars: 0, sample: own.slice(0, 60), color: s.color };
      g.tags.add(el.tagName.toLowerCase()); g.count++; g.chars += own.length; typo.set(key, g);
    }
    const typography = [...typo.values()].map(g => ({ ...g, tags: [...g.tags].join(',') }))
      .sort((a, b) => parseFloat(b.style.split(' | ')[1]) - parseFloat(a.style.split(' | ')[1])).slice(0, 40);

    // цвета: текст по числу символов, фон по площади
    const textC = {}, bgC = {}, borderC = {}, radii = {}, shadows = {};
    for (const el of all) {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim().length;
      if (own) textC[s.color] = (textC[s.color] || 0) + own;
      if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') bgC[s.backgroundColor] = (bgC[s.backgroundColor] || 0) + round(r.width * r.height / 1000);
      if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') borderC[`${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`] = (borderC[`${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`] || 0) + 1;
      if (s.borderTopLeftRadius !== '0px') radii[s.borderTopLeftRadius] = (radii[s.borderTopLeftRadius] || 0) + 1;
      if (s.boxShadow !== 'none') shadows[s.boxShadow] = (shadows[s.boxShadow] || 0) + 1;
    }
    const top = (o, n = 15) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ value: k, weight: v }));

    // контейнер: самые частые ширины центрированных блоков уже экрана
    const widths = {};
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width < W * 0.5 || r.width > W - 2 || r.height < 60) continue;
      if (Math.abs(r.left - (W - r.right)) > 4) continue;
      widths[round(r.width)] = (widths[round(r.width)] || 0) + 1;
    }

    // секции: прямые потомки main (или body), высота > 120
    const root = document.querySelector('main') || document.body;
    let tops = [...root.children].filter(vis);
    if (tops.length === 1 && tops[0].children.length > 3) tops = [...tops[0].children].filter(vis);
    const sections = tops.filter(el => el.getBoundingClientRect().height > 120).map(el => {
      const s = getComputedStyle(el);
      const h = el.querySelector('h1,h2,h3');
      const imgs = [...el.querySelectorAll('img,video,picture source,canvas,svg')].filter(vis);
      const sticky = [...el.querySelectorAll('*')].filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position)).map(e => ({ el: desc(e), top: getComputedStyle(e).top, h: round(e.getBoundingClientRect().height), parentH: round(e.parentElement.getBoundingClientRect().height) }));
      return {
        el: desc(el), top: absTop(el), height: round(el.getBoundingClientRect().height),
        bg: s.backgroundColor, padding: `${s.paddingTop} / ${s.paddingBottom}`,
        heading: h ? h.innerText.trim().replace(/\s+/g, ' ').slice(0, 90) : '',
        media: { img: imgs.filter(e => e.tagName === 'IMG').length, video: imgs.filter(e => e.tagName === 'VIDEO').length, svg: imgs.filter(e => e.tagName === 'svg').length, canvas: imgs.filter(e => e.tagName === 'CANVAS').length },
        sticky: sticky.slice(0, 5),
      };
    });

    // картинки и видео: что, где, какого размера, на весь экран или внутри чего-то
    const deviceRe = /iphone|phone|mobile-frame|device|macbook|laptop|mockup|bezel|screen|monitor|ipad|watch/i;
    const media = [...document.querySelectorAll('img,video')].filter(vis).map(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      let anc = el.parentElement, device = '';
      for (let i = 0; anc && i < 6; i++, anc = anc.parentElement) {
        const c = (typeof anc.className === 'string' ? anc.className : '') + ' ' + (anc.id || '');
        if (deviceRe.test(c)) { device = desc(anc); break; }
      }
      const src = el.currentSrc || el.src || el.querySelector?.('source')?.src || '';
      return {
        tag: el.tagName.toLowerCase(), src: src.slice(0, 200), alt: el.alt || '',
        natural: el.naturalWidth ? `${el.naturalWidth}×${el.naturalHeight}` : el.videoWidth ? `${el.videoWidth}×${el.videoHeight}` : '',
        rect: `${round(r.width)}×${round(r.height)} @ y${absTop(el)}`,
        fullBleed: r.width >= W * 0.9, objectFit: s.objectFit, device,
        autoplay: el.autoplay ?? undefined, loop: el.loop ?? undefined,
      };
    });
    const bgImages = all.map(el => ({ el, bi: getComputedStyle(el).backgroundImage })).filter(x => x.bi && x.bi.includes('url('))
      .map(({ el, bi }) => { const r = el.getBoundingClientRect(); return { el: desc(el), image: bi.slice(0, 200), rect: `${round(r.width)}×${round(r.height)} @ y${absTop(el)}` }; }).slice(0, 60);

    // закреплённые элементы и библиотеки
    const pinned = all.filter(el => ['sticky', 'fixed'].includes(getComputedStyle(el).position)).map(el => ({
      el: desc(el), position: getComputedStyle(el).position, top: getComputedStyle(el).top,
      h: round(el.getBoundingClientRect().height), parentH: round(el.parentElement.getBoundingClientRect().height), y: absTop(el),
    })).slice(0, 60);
    const srcs = [...document.scripts].map(s => s.src).filter(Boolean);
    const has = re => srcs.some(s => re.test(s));
    const ST = window.ScrollTrigger;
    const scrollTriggers = ST?.getAll ? ST.getAll().map(t => ({
      trigger: t.trigger ? desc(t.trigger) : '', start: t.start, end: t.end, pin: !!t.pin, scrub: t.vars?.scrub ?? null,
      vars: JSON.stringify({ start: t.vars?.start, end: t.vars?.end, toggleActions: t.vars?.toggleActions }),
    })) : [];
    const libs = {
      gsap: !!window.gsap || has(/gsap/i), scrollTrigger: !!ST || has(/scrolltrigger/i),
      lenis: !!window.lenis || document.documentElement.className.includes('lenis') || has(/lenis/i),
      lottie: !!window.lottie || has(/lottie|bodymovin/i) || !!document.querySelector('lottie-player, dotlottie-player'),
      three: !!window.THREE || has(/three/i), rive: has(/rive/i) || !!document.querySelector('canvas[class*=rive]'),
      framer: !!document.querySelector('[data-framer-appear-id], [data-projection-id], [data-framer-name]'),
      nextjs: !!document.getElementById('__next') || !!window.next, webflow: !!document.querySelector('html[data-wf-site]'),
      scripts: srcs.map(s => s.slice(0, 140)).slice(0, 40),
    };
    return {
      title: document.title, scrollHeight: document.documentElement.scrollHeight,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      fonts: [...new Set(fonts)], typography,
      colors: { text: top(textC), background: top(bgC), borders: top(borderC, 10) },
      radii: top(radii, 10), shadows: top(shadows, 10),
      containerWidths: top(widths, 8), sections, media, bgImages, pinned, libs, scrollTriggers,
    };
  });

  // стили страницы: файлы + встроенные <style>
  const inline = await page.evaluate(() => [...document.querySelectorAll('style')].map(s => s.textContent).join('\n'));
  let allCss = inline;
  let i = 0;
  for (const [u, t] of cssFiles) {
    allCss += '\n' + t;
    await fs.writeFile(path.join(outDir, 'css', `${tag}-${String(i++).padStart(2, '0')}-${path.basename(new URL(u).pathname).slice(0, 60) || 'style.css'}`), t);
  }
  await fs.writeFile(path.join(outDir, 'css', `${tag}-inline.css`), inline);
  if (tag === 'desktop' || only) await fs.writeFile(path.join(outDir, 'page.html'), await page.content());

  report.viewports[tag] = { ...data, css: { files: [...cssFiles.keys()], ...cssMotion(allCss) }, liveAnimations: [...liveAnims.values()] };
  console.log(`[${tag}] секций: ${data.sections.length}, картинок/видео: ${data.media.length}, шрифтов: ${data.fonts.length}, анимаций: ${liveAnims.size}, scroll-правил CSS: ${report.viewports[tag].css.scrollRules.length}`);
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(outDir, 'inspect.json'), JSON.stringify(report, null, 2));

// короткая выжимка для паспорта
const d = report.viewports.desktop || Object.values(report.viewports)[0];
const L = [];
L.push(`# Разбор кода: ${url}`, '', `Снято ${report.date.slice(0, 10)}. Полные данные — \`inspect.json\`, стили — \`css/\`.`, '');
L.push('## Шрифты', ...d.fonts.map(f => `- ${f}`), '');
L.push('## Типографика (семейство | кегль | вес | интерлиньяж | трекинг | регистр — теги, число, пример)');
for (const t of d.typography.slice(0, 20)) L.push(`- ${t.style} — ${t.tags}, ×${t.count}, «${t.sample}»`);
L.push('', '## Цвета', '- Текст: ' + d.colors.text.slice(0, 8).map(c => c.value).join('; '), '- Фон (по площади): ' + d.colors.background.slice(0, 8).map(c => c.value).join('; '), '- Рамки: ' + d.colors.borders.slice(0, 5).map(c => c.value).join('; '));
L.push('', `## Сетка`, `- Ширины центрированных контейнеров: ${d.containerWidths.map(c => `${c.value} (×${c.weight})`).join(', ')}`, `- Радиусы: ${d.radii.map(r => `${r.value} ×${r.weight}`).join(', ')}`, `- Тени: ${d.shadows.slice(0, 4).map(r => `\`${r.value}\``).join('; ')}`);
L.push('', '## Секции (y, высота, фон, отступы, заголовок, медиа, закрепления)');
for (const s of d.sections) L.push(`- y${s.top} h${s.height} · ${s.bg} · ${s.padding} · «${s.heading}» · img ${s.media.img}, video ${s.media.video}, svg ${s.media.svg}${s.sticky.length ? ' · sticky: ' + s.sticky.map(x => `${x.el} top ${x.top} (${x.h}/${x.parentH})`).join('; ') : ''}`);
L.push('', '## Картинки и видео');
for (const m of d.media.slice(0, 50)) L.push(`- ${m.tag} ${m.rect} ${m.natural ? '(' + m.natural + ')' : ''}${m.fullBleed ? ' НА ВСЮ ШИРИНУ' : ''}${m.device ? ' в устройстве ' + m.device : ''} — ${m.alt || m.src.split('/').pop()}`);
L.push('', '## Движение', `- Библиотеки: ${Object.entries(d.libs).filter(([k, v]) => v === true).map(([k]) => k).join(', ') || 'нет'}`);
L.push(`- ScrollTrigger: ${d.scrollTriggers.length}`, ...d.scrollTriggers.slice(0, 30).map(t => `  - ${t.trigger} ${t.start}→${t.end} pin:${t.pin} scrub:${t.scrub}`));
L.push(`- CSS-анимации по скроллу (${d.css.scrollRules.length}):`, ...d.css.scrollRules.slice(0, 40).map(r => `  - \`${r.selector}\` { ${r.body} }`));
L.push(`- @keyframes (${Object.keys(d.css.keyframes).length}): ${Object.keys(d.css.keyframes).join(', ')}`);
L.push(`- Живые анимации на странице (${d.liveAnimations.length}):`, ...d.liveAnimations.slice(0, 40).map(a => `  - ${a.name} → ${a.target} · ${a.timeline} · ${a.duration} мс · ${a.easing} · ${a.iterations}`));
L.push(`- Закреплённые: `, ...d.pinned.slice(0, 20).map(p => `  - ${p.position} ${p.el} top ${p.top}, ${p.h}/${p.parentH} px, y${p.y}`));
await fs.writeFile(path.join(outDir, 'summary.md'), L.join('\n'));
console.log(`Готово: ${outDir} (summary.md, inspect.json, css/, page.html)`);
