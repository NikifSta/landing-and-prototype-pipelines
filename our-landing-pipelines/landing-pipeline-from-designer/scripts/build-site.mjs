// Сборка лендинга: подставляет фрагменты 08-ui в шаблон страницы и пишет один HTML-файл.
// node scripts/build-site.mjs <папка проекта>        например: projects/<slug>
// Вход:  <проект>/site/src/page.html (шаблон страницы) и <проект>/08-ui/ (ui.css, ui.js, NN-имя.html; в старых проектах 07-ui)
// Выход: <проект>/site/index.html
// Плейсхолдеры шаблона: {{ui.css}}, {{ui.js}}, {{fragment:NN-имя}} (разметка фрагмента),
//   {{fragment-styles}} (стили всех использованных фрагментов), {{fragment-scripts}} (их скрипты).
// Картинки во фрагменте: src="../site/assets/x.jpg" data-site-src="assets/x.jpg" — на сайте подставится data-site-src.
// Фрагмент изолируется: id получают префикс fNN-, стили оборачиваются в @scope (#fNN), скрипт — в блок { }.
import fs from 'node:fs/promises';
import path from 'node:path';

const project = process.argv[2];
if (!project) { console.error('usage: build-site.mjs <projectDir>'); process.exit(1); }
const read = p => fs.readFile(path.join(project, p), 'utf8');
let page = await read('site/src/page.html');
// папка интерфейсов: 08-ui (новый порядок этапов: media перед ui) или 07-ui (старые проекты)
let UI = '08-ui'; try { await fs.access(path.join(project, UI)); } catch { UI = '07-ui'; }
const css = await read(`${UI}/ui.css`), js = await read(`${UI}/ui.js`);

const styles = [], scripts = [], idOwners = new Map(), hoisted = [], keyframeNames = new Set();
const used = [...page.matchAll(/\{\{fragment:([\w-]+)\}\}/g)].map(m => m[1]);
const fragments = {};
for (const name of used) {
  const num = name.match(/^(\d+)/)?.[1] ?? name;
  const pre = `f${num}`;
  const src = await read(`${UI}/${name}.html`);
  const ids = [...src.matchAll(/\sid="([\w-]+)"/g)].map(m => m[1]);
  for (const id of ids) (idOwners.get(id) || idOwners.set(id, []).get(id)).push(pre);
  // граница фрагмента: только содержимое секции; шапка, подвал, main и документ принадлежат шаблону страницы
  const bodyText = src.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] || '';
  for (const tag of ['header', 'main', 'footer', 'nav']) if (new RegExp(`<${tag}[\\s>]`).test(bodyText)) console.warn(`ПРЕДУПРЕЖДЕНИЕ: фрагмент ${name} содержит <${tag}>: шапку, подвал и main должен давать page.html`);
  const rename = text => ids.reduce((t, id) => t
    .replace(new RegExp(`(\\sid=")${id}(")`, 'g'), `$1${pre}-${id}$2`)
    .replace(new RegExp(`(getElementById\\(['"])${id}(['"]\\))`, 'g'), `$1${pre}-${id}$2`)
    .replace(new RegExp(`(['"\\s>,(])#${id}(?![\\w-])`, 'g'), `$1#${pre}-${id}`), text);
  const body = src.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
  // src="путь-для-фрагмента" data-site-src="путь-для-сайта" → на сайте остаётся путь для сайта
  const markup = body.replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/\ssrc="[^"]*"(\s[^>]*?)?\sdata-site-src="([^"]*)"/g, (_, mid = '', s) => ` src="${s}"${mid}`);
  // «обвязка для предпросмотра» (отступы в vh вокруг сцены) целиком попадает в сборку и даёт провалы между секциями
  for (const m of bodyText.matchAll(/<(?!\/)[a-z0-9]+[^>]*style="[^"]*(?:min-)?height:\s*\d+(?:\.\d+)?vh[^"]*"/gi)) console.warn(`ПРЕДУПРЕЖДЕНИЕ: во фрагменте ${name} есть элемент с высотой в vh в разметке (${m[0].slice(0, 80)}…): если это отступ для предпросмотра, перенеси его в стиль body — в сборку он попадёт как пустой провал`);
  let fragStyles = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  // @keyframes внутри @scope ненадёжны: выносим их на верхний уровень (имена должны быть уникальны между фрагментами)
  for (let m; (m = /@keyframes\s+([\w-]+)\s*\{/.exec(fragStyles));) {
    // вырезаем блок целиком (с телом), а не только заголовок: иначе лишняя «}» закроет @scope раньше времени
    let depth = 1, i = m.index + m[0].length; while (i < fragStyles.length && depth) { depth += fragStyles[i] === '{' ? 1 : fragStyles[i] === '}' ? -1 : 0; i++; }
    if (keyframeNames.has(m[1])) console.warn(`ПРЕДУПРЕЖДЕНИЕ: @keyframes ${m[1]} объявлен в нескольких фрагментах — переименуй`);
    keyframeNames.add(m[1]); hoisted.push(fragStyles.slice(m.index, i));
    fragStyles = fragStyles.slice(0, m.index) + fragStyles.slice(i);
  }
  { const o = (fragStyles.match(/\{/g) || []).length, c = (fragStyles.match(/\}/g) || []).length; if (o !== c) console.warn(`ПРЕДУПРЕЖДЕНИЕ: в стилях фрагмента ${name} не сходятся скобки ({ ${o}, } ${c}): стили после этого места не применятся`); }
  const fragScripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  fragments[name] = `<div class="fragment" id="${pre}" data-fragment="${name}">${rename(markup)}</div>`;
  if (fragStyles.trim()) styles.push(`/* ${name} */\n@scope (#${pre}) {\n${rename(fragStyles)}\n}`);
  if (fragScripts.trim()) scripts.push(`/* ${name} */\n{\n${rename(fragScripts)}\n}`);
}
page = page.replace(/\{\{fragment:([\w-]+)\}\}/g, (_, n) => fragments[n])
  .replace('{{ui.css}}', () => css)
  .replace('{{ui.js}}', () => js)
  .replace('{{fragment-styles}}', () => hoisted.concat(styles).join('\n'))
  .replace('{{fragment-scripts}}', () => scripts.join('\n'));
// ссылки-якоря вне фрагментов: #id → #fNN-id для переименованных id, которые есть ровно в одном фрагменте
const anchorMap = new Map([...idOwners].filter(([, owners]) => owners.length === 1).map(([id, owners]) => [id, `${owners[0]}-${id}`]));
let fixed = 0, dangling = [];
page = page.replace(/href="#([\w-]+)"/g, (m, id) => { if (anchorMap.has(id)) { fixed++; return `href="#${anchorMap.get(id)}"`; } return m; });
const allIds = new Set([...page.matchAll(/\sid="([\w-]+)"/g)].map(m => m[1]));
for (const m of page.matchAll(/href="#([\w-]+)"/g)) if (m[1] && !allIds.has(m[1]) && !dangling.includes(m[1])) dangling.push(m[1]);
if (fixed) console.log(`Якорей перенаправлено на переименованные id: ${fixed}`);
if (dangling.length) console.warn(`ПРЕДУПРЕЖДЕНИЕ: ссылки на несуществующие якоря: ${dangling.map(x => '#' + x).join(', ')}`);
const out = path.join(project, 'site/index.html');
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, page, 'utf8');
console.log(`Готово: ${out} (${used.length} фрагментов, ${(page.length / 1024).toFixed(0)} КБ)`);
