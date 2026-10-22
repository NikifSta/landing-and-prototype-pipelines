// Добавить сайт в базу референсов: код страницы, полностраничный скриншот, превью первого экрана и полосы блоков, заготовка паспорта.
// node scripts/add-reference.mjs <url> <ref-id> [--name="Название"]
//   ref-id: короткое имя латиницей через дефис (например, stripe, linear-app); по нему ссылаются паспорт, превью и каталог.
// Результат:
//   references/shots/<ref-id>/code/summary.md (+ inspect.json, css/)   — шрифты, кегли, цвета, сетка, анимации, закрепления
//   references/shots/<ref-id>/shots/0-desktop.png                      — полностраничный снимок (в релиз не входит)
//   references/thumbs/<ref-id>.jpg, references/blocks/<ref-id>/NN.jpg  — лёгкие превью (входят в релиз)
//   references/<ref-id>.md                                             — заготовка паспорта (URL и что заполнить)
// Дальше архетипы блоков и язык записывает агент по скиллу ref-hunt в references/_archetypes/part-added-<ref-id>*.json.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, loadEnv } from './_env.mjs';
loadEnv();

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; }));
const [url, ref] = args.filter(a => !a.startsWith('--'));
if (!url || !ref || !/^https?:\/\//.test(url) || !/^[a-z0-9][a-z0-9-]*$/.test(ref)) { console.error('usage: add-reference.mjs <https://адрес> <ref-id латиницей-через-дефис> [--name="Название"]'); process.exit(1); }
const base = path.join(ROOT, 'references/shots', ref);
await fs.mkdir(path.join(base, 'shots'), { recursive: true }); await fs.mkdir(path.join(base, 'code'), { recursive: true });

// 1. код страницы (шрифты, кегли, цвета, анимации)
console.log('1/4 разбор кода страницы…');
const ins = spawnSync(process.execPath, [path.join(ROOT, 'scripts/inspect.mjs'), url, path.join(base, 'code'), '--only=desktop'], { encoding: 'utf8', timeout: 8 * 60e3 });
const hasCode = await fs.access(path.join(base, 'code/summary.md')).then(() => true, () => false);
console.log(hasCode ? '   готово' : `   НЕ УДАЛОСЬ (код ${ins.status}): ${(ins.stderr || ins.stdout || '').trim().split('\n').slice(-2).join(' ')}\n   Дальше: PROXY из .env → web.archive.org/web/2/<url> → пометка «не проверен»`);

// 2. полностраничный скриншот с прогревом (ленивая подгрузка)
console.log('2/4 снимок страницы…');
const browser = await chromium.launch(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {});
let shotOk = false;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(base, 'shots/0-desktop.png'), fullPage: true });
  shotOk = true; console.log('   готово');
} catch (e) { console.log('   НЕ УДАЛОСЬ: ' + String(e.message).split('\n')[0]); }
await browser.close();

// 3. превью
if (shotOk) {
  console.log('3/4 превью первого экрана и полосы блоков…');
  spawnSync(process.execPath, [path.join(ROOT, 'scripts/make-thumbs.mjs'), ref], { stdio: 'inherit' });
  spawnSync(process.execPath, [path.join(ROOT, 'scripts/make-block-thumbs.mjs'), ref, '--max=9'], { stdio: 'inherit' });
}

// 4. заготовка паспорта
const passport = path.join(ROOT, 'references', ref + '.md');
if (!(await fs.access(passport).then(() => true, () => false))) {
  await fs.writeFile(passport, `# ${flags.name || ref}\n\n**URL:** ${url}\n**Добавлен:** ${new Date().toISOString().slice(0, 10)} (скрипт add-reference.mjs)\n**Источник данных:** код страницы \`references/shots/${ref}/code/summary.md\`, превью \`references/blocks/${ref}/\`\n\n## Что заполнить (агент по скиллу ref-hunt)\n- Настроение, палитра, шрифты, плотность (по summary.md и полосам блоков).\n- Как референс показывает продукт (интерфейс, устройства, иллюстрации, фото, видео).\n- Блоки по порядку: роль, композиция, движение (бегущая строка, закрепление, параллакс — есть ли на самом деле).\n- Что берём как идею и что нельзя копировать.\n`, 'utf8');
}
console.log(`4/4 паспорт: references/${ref}.md\n\nДальше: агент по скиллу ref-hunt заполняет паспорт и пишет архетипы в references/_archetypes/part-added-${ref}.json и part-added-${ref}.languages.json (формат — _SCHEMA.md), затем node scripts/catalog-stats.mjs.`);
