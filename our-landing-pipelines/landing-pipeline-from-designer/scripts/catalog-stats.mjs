// Сводка по каталогу архетипов: роли, семейства, донорские референсы, ссылки avoid_same_page_as, дубликаты id.
// node scripts/catalog-stats.mjs [--flag-risky]   (--flag-risky помечает risky:true архетипы, нарушающие правила: FAQ, команда людей, фон «для настроения»)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../references/_archetypes');
const files = (await fs.readdir(dir)).filter(f => /^part-.*\.json$/.test(f));
const RISKY_IDS = /faq|portrait-grid-hover|question-tabs-answer|wallpaper-screens|cards-on-fabric|team-grid|meet-the-team/i;
const flag = process.argv.includes('--flag-risky');
const all = [], langs = [];
for (const f of files) {
  const p = path.join(dir, f);
  const data = JSON.parse((await fs.readFile(p, 'utf8')).replace(/^﻿/, ''));
  if (f.endsWith('.languages.json')) { langs.push(...data); continue; }
  let changed = false;
  for (const a of data) {
    if (flag && !a.risky && (RISKY_IDS.test(a.id) || /faq/i.test(a.family || ''))) { a.risky = true; changed = true; }
    all.push(a);
  }
  if (changed) await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}
const count = (arr, f) => arr.reduce((m, x) => (m.set(f(x), (m.get(f(x)) || 0) + 1), m), new Map());
const ids = new Map(); for (const a of all) ids.set(a.id, (ids.get(a.id) || 0) + 1);
console.log(`Архетипов: ${all.length}, языков: ${langs.length}, семейств: ${new Set(all.map(a => a.family)).size}, risky: ${all.filter(a => a.risky).length}`);
console.log('Роли:', [...count(all, a => a.role)].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('Образность:', [...count(all, a => String(a.imagery).split('|')[0].trim())].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('Движение:', [...count(all, a => String(a.motion).split('|')[0].trim())].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('Языки: палитры', [...count(langs, l => String(l.palette_family).split('|')[0].trim())].map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('Языки: шрифты', [...count(langs, l => String(l.type_class).split('|')[0].trim())].map(([k, v]) => `${k} ${v}`).join(' · '));
const dups = [...ids].filter(([, n]) => n > 1).map(([k]) => k);
if (dups.length) console.log('ДУБЛИ id:', dups.join(', '));
const known = new Set([...ids.keys(), ...all.map(a => a.family)]);
const dangling = new Set(); for (const a of all) for (const x of a.avoid_same_page_as || []) if (!known.has(x)) dangling.add(x);
if (dangling.size) console.log('Ссылки avoid_same_page_as на несуществующие id/семейства:', [...dangling].join(', '));
const thin = ['hero', 'problem', 'mechanism', 'process', 'proof-numbers', 'proof-social', 'comparison', 'data-viz', 'devices', 'feature-grid', 'pricing', 'integrations', 'launch', 'cta', 'story', 'manifesto'].filter(r => all.filter(a => a.role === r && !a.risky).length < 8);
console.log('Тонкие роли (<8 безопасных):', thin.map(r => `${r} ${all.filter(a => a.role === r && !a.risky).length}`).join(', ') || 'нет');
