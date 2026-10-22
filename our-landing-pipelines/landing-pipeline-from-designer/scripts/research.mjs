// Исследование сайта конкурента: скриншоты десктоп/мобайл + тексты страниц.
// node scripts/research.mjs <url> <outDir> [maxPages=6]
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const [url, outDir, maxArg] = process.argv.slice(2);
if (!url || !outDir) { console.error('usage: research.mjs <url> <outDir> [maxPages]'); process.exit(1); }
const maxPages = Number(maxArg || 6);
await fs.mkdir(path.join(outDir, 'shots'), { recursive: true });

import { loadEnv } from './_env.mjs';
loadEnv(); // .env рабочей папки, затем корня плагина
const proxy = process.env.PROXY;
// закрыть cookie-баннеры и всплывающие формы, чтобы они не попали на скриншот
async function dismissPopups(page) {
  try {
    await page.evaluate(() => {
      const re = /^(accept( all)?|agree|ok|got it|allow all|принять( все)?|согласен|хорошо|понятно|закрыть|close|×|✕)$/i;
      for (const b of document.querySelectorAll('button,[role=button],a')) {
        const tx = (b.innerText || b.getAttribute('aria-label') || '').trim();
        if (re.test(tx)) { try { b.click(); } catch {} }
      }
      for (const d of document.querySelectorAll('[role=dialog],[class*="cookie" i],[id*="cookie" i],[class*="consent" i]')) { if (getComputedStyle(d).position === 'fixed') d.style.display = 'none'; }
    });
  } catch {}
}
const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
const origin = new URL(url).origin;
const queue = [url], seen = new Set(), pages = [];

while (queue.length && pages.length < maxPages) {
  const u = queue.shift();
  if (seen.has(u)) continue; seen.add(u);
  const idx = pages.length;
  for (const [tag, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    try {
      page.setDefaultTimeout(90000);
      // сайты с постоянными запросами (аналитика, видео) никогда не «затихают» — тогда ждём обычную загрузку
      try { await page.goto(u, { waitUntil: 'networkidle', timeout: 45000 }); }
      catch { await page.goto(u, { waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(3000); }
      await page.waitForTimeout(1500);
      await dismissPopups(page);
      // прокрутка, чтобы подгрузились ленивые блоки и анимации
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); });
      const name = `${idx}-${tag}.png`;
      await page.screenshot({ path: path.join(outDir, 'shots', name), fullPage: true });
      if (tag === 'mobile') pages[idx]?.shots.push(name); // мобильный снимок записан, только если он есть
      if (tag === 'desktop') {
        const data = await page.evaluate(() => ({
          title: document.title,
          description: document.querySelector('meta[name=description]')?.content || '',
          headings: [...document.querySelectorAll('h1,h2,h3')].map(h => `${h.tagName}: ${h.innerText.trim()}`).filter(Boolean),
          text: document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 20000),
          links: [...document.querySelectorAll('a[href]')].map(a => a.href)
        }));
        pages.push({ url: u, ...data, shots: [name] });
        for (const l of data.links) {
          try { const p = new URL(l); if (p.origin === origin && !p.hash && !seen.has(p.href) && !/\.(pdf|zip|png|jpg)$/i.test(p.pathname)) queue.push(p.href); } catch {}
        }
      }
    } catch (e) { console.warn('skip', u, tag, e.message); }
    await page.close();
  }
}
await browser.close();
await fs.writeFile(path.join(outDir, 'pages.json'), JSON.stringify(pages.map(({ links, ...p }) => p), null, 2));
if (!pages.length) {
  console.error(`ОШИБКА: ни одна страница не открылась (${url}). Попробуйте PROXY в .env или архивную копию https://web.archive.org/web/2/<url>.`);
  process.exit(2);
}
console.log(`Готово: ${pages.length} стр., ${outDir}`);
