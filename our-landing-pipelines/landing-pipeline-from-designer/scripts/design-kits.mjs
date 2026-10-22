// Запасной источник дизайн-систем без MCP и ключей: репозиторий VoltAgent/awesome-design-md (MIT).
// node scripts/design-kits.mjs list [слово]          — список папок-брендов (slug), можно отфильтровать словом
// node scripts/design-kits.mjs get <slug> <файл.md>  — скачать DESIGN.md бренда
// Slug часто совпадает с доменом: linear.app, mistral.ai, x.ai; бывают короткие (cal, theverge).
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO = 'VoltAgent/awesome-design-md';
const [cmd, a, b] = process.argv.slice(2);

// сеть бывает нестабильной (ECONNRESET): до 4 попыток с растущей паузой
async function get(url) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'landing-pipeline' } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res;
    } catch (e) {
      last = e;
      if (/^40[0-9]/.test(e.message)) break; // 4xx повторять бессмысленно
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw last;
}

if (cmd === 'list') {
  const items = await (await get(`https://api.github.com/repos/${REPO}/contents/design-md`)).json();
  const slugs = items.filter(i => i.type === 'dir').map(i => i.name)
    .filter(n => !a || n.toLowerCase().includes(a.toLowerCase()));
  console.log(slugs.join('\n'));
  console.error(`Найдено: ${slugs.length}`);
} else if (cmd === 'get' && a && b) {
  const text = await (await get(`https://raw.githubusercontent.com/${REPO}/main/design-md/${a}/DESIGN.md`)).text();
  await fs.mkdir(path.dirname(b), { recursive: true });
  await fs.writeFile(b, text, 'utf8');
  console.log(`Сохранено: ${b} (${text.length} символов)`);
} else {
  console.error('usage: design-kits.mjs list [слово] | get <slug> <файл.md>');
  process.exit(1);
}
