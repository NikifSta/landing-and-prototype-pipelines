// Запись движения на странице: видео прокрутки, кадры по шагам, отчёт об анимациях.
// node scripts/motion.mjs <url> <outDir> [шаг прокрутки в px] [--headed] [--only=desktop|mobile]
//   --headed  видимое окно системного Edge (GPU, кодеки): для тяжёлых WebGL/3D-сцен, которые не грузятся в фоне.
//             Видео пишется только с области страницы, без рамки окна. Во время записи окно не трогать.
//   --only    записать один вьюпорт, например --only=mobile вместо записи телефона вручную.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadEnv } from './_env.mjs';
loadEnv(); // .env рабочей папки, затем корня плагина

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const [url, outDir, stepArg] = args.filter(a => !a.startsWith('--'));
if (!url || !outDir) { console.error('usage: motion.mjs <url> <outDir> [stepPx] [--headed] [--only=desktop|mobile]'); process.exit(1); }
const headed = flags.includes('--headed');
const only = (flags.find(f => f.startsWith('--only=')) || '').split('=')[1];
const proxy = process.env.PROXY;
const launchOpts = { ...(proxy ? { proxy: { server: proxy } } : {}), ...(headed ? { headless: false, channel: 'msedge' } : {}) };
const browser = await chromium.launch(launchOpts);
if (proxy) console.log('Через прокси:', proxy);
if (headed) console.log('Видимое окно Edge — не сворачивайте и не перекрывайте его до конца записи');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { url, date: new Date().toISOString(), viewports: {} };

for (const [tag, vp, mobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['mobile', { width: 390, height: 844 }, true],
].filter(([tag]) => !only || tag === only)) {
  const framesDir = path.join(outDir, 'frames', tag);
  await fs.mkdir(framesDir, { recursive: true });
  const context = await browser.newContext({
    viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    recordVideo: { dir: path.join(outDir, 'video-tmp'), size: vp },
  });
  // короткое описание элемента: тег.класс «текст»
  await context.addInitScript(() => {
    window.__describe = (el) => {
      if (!el || !el.tagName) return '';
      const raw = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
      const cls = raw.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      const txt = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
      return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') + (txt ? ' «' + txt + '»' : '');
    };
  });
  const page = await context.newPage();
  const video = page.video();

  // какие анимации идут прямо сейчас (CSS animation / transition / Web Animations)
  const anims = new Map();
  const collect = async (y) => {
    const list = await page.evaluate(() => document.getAnimations().map(a => {
      const t = a.effect?.getTiming?.() || {};
      return {
        kind: a.constructor.name,
        name: a.animationName || a.transitionProperty || a.id || '',
        duration: t.duration, delay: t.delay,
        iterations: t.iterations === Infinity ? 'infinite' : t.iterations,
        easing: t.easing,
        target: window.__describe(a.effect?.target),
      };
    })).catch(() => []);
    for (const a of list) {
      const key = `${a.kind}|${a.name}|${a.target}`;
      if (!anims.has(key) && anims.size < 400) anims.set(key, { ...a, firstSeenAtY: y });
    }
  };

  console.log(`[${tag}] открываю ${url}`);
  // тяжёлые WebGL-страницы снимаются дольше стандартных 30 с
  page.setDefaultTimeout(90000);
  // повтор при обрыве соединения
  for (let attempt = 1; ; attempt++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); break; }
    catch (e) { if (attempt >= 3) throw e; console.warn(`[${tag}] повтор загрузки (${e.message.split('\n')[0]})`); await sleep(3000); }
  }

  // 1) появление первого экрана: серия кадров по времени
  const t0 = Date.now();
  for (const ms of [0, 400, 1000, 2000, 3500]) {
    await sleep(Math.max(0, ms - (Date.now() - t0)));
    await page.screenshot({ path: path.join(framesDir, `intro-${String(ms).padStart(4, '0')}ms.png`) });
    await collect(0);
  }

  // 2) прокрутка по шагам: на каждой позиции два кадра с паузой
  const step = Number(stepArg) || Math.round(vp.height * 0.5);
  await page.mouse.move(vp.width / 2, vp.height / 2);
  const frames = [];
  let lastY = -1, stuck = 0;
  for (let i = 0; i < 200; i++) {
    const { y, h } = await page.evaluate(() => ({ y: Math.round(window.scrollY), h: document.documentElement.scrollHeight }));
    const name = `${String(i).padStart(3, '0')}-y${y}`;
    await collect(y);
    await sleep(600);
    const a = await page.screenshot({ path: path.join(framesDir, `${name}.png`) });
    await collect(y);
    await sleep(1200);
    const b = await page.screenshot();
    const moving = !a.equals(b); // кадр изменился без прокрутки -> что-то анимируется на месте
    if (moving) await fs.writeFile(path.join(framesDir, `${name}-b.png`), b);
    frames.push({ frame: `${name}.png`, y, moving });
    if (y + vp.height >= h - 2) break;
    if (y === lastY) { if (++stuck >= 3) break; } else stuck = 0;
    lastY = y;
    await page.mouse.wheel(0, step); // колесо мыши, чтобы сработали плавные скроллы (Lenis и т. п.)
    await sleep(300);
    const y2 = await page.evaluate(() => Math.round(window.scrollY));
    if (y2 === y) await page.evaluate(s => window.scrollBy(0, s), step);
  }

  // 3) закреплённые блоки и технологии
  const pinned = await page.evaluate(() => [...document.querySelectorAll('body *')].slice(0, 8000)
    .filter(el => ['sticky', 'fixed'].includes(getComputedStyle(el).position))
    .map(el => ({
      position: getComputedStyle(el).position,
      top: getComputedStyle(el).top,
      height: Math.round(el.getBoundingClientRect().height),
      parentHeight: Math.round(el.parentElement?.getBoundingClientRect().height || 0),
      el: window.__describe(el),
    })));
  const tech = await page.evaluate(() => {
    const srcs = [...document.scripts].map(s => s.src).filter(Boolean);
    const has = re => srcs.some(s => re.test(s));
    return {
      gsap: !!window.gsap || has(/gsap/i),
      scrollTrigger: !!window.ScrollTrigger || has(/scrolltrigger/i),
      lenis: !!window.lenis || document.documentElement.className.includes('lenis') || has(/lenis/i),
      lottie: !!window.lottie || has(/lottie|bodymovin/i) || !!document.querySelector('lottie-player, dotlottie-player'),
      three: !!window.THREE || has(/three/i),
      framerMotion: !!document.querySelector('[data-framer-appear-id], [data-projection-id]'),
      videos: [...document.querySelectorAll('video')].map(v => ({
        src: v.currentSrc || v.src, autoplay: v.autoplay, loop: v.loop, muted: v.muted,
        el: window.__describe(v.parentElement),
      })),
      canvases: document.querySelectorAll('canvas').length,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });

  await context.close();
  await video.saveAs(path.join(outDir, `${tag}.webm`));
  await video.delete();
  report.viewports[tag] = { tech, pinned, frames, animations: [...anims.values()] };
  console.log(`[${tag}] кадров: ${frames.length}, движутся на месте: ${frames.filter(f => f.moving).length}, анимаций: ${anims.size}, закреплённых блоков: ${pinned.length}`);
}

await browser.close();
await fs.rm(path.join(outDir, 'video-tmp'), { recursive: true, force: true });
await fs.writeFile(path.join(outDir, 'motion.json'), JSON.stringify(report, null, 2));
console.log(`Готово: ${outDir} (motion.json, desktop.webm, mobile.webm, frames/)`);
