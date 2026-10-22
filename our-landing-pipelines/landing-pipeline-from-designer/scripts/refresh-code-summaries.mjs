// Для сопровождающих плагин: пакетный разбор кода сайтов-референсов (inspect.mjs) для тех, у кого ещё нет references/shots/<ref>/code/summary.md.
// node scripts/refresh-code-summaries.mjs [ref ...] [--force]
// Результат — references/shots/<ref>/code/summary.md (в релиз попадают только .md; остальное остаётся локально).
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './_env.mjs';

const args = process.argv.slice(2), force = args.includes('--force'), only = args.filter(a => !a.startsWith('--'));
const refsDir = path.join(ROOT, 'references');
const log = [];
for (const f of (await fs.readdir(refsDir)).filter(f => f.endsWith('.md') && !/^_|platform-guidelines/.test(f))) {
  const ref = f.replace(/\.md$/, ''); if (only.length && !only.includes(ref)) continue;
  const text = await fs.readFile(path.join(refsDir, f), 'utf8');
  const url = text.match(/\*\*URL:\*\*\s*(\S+)/)?.[1]; if (!url || !/^https?:/.test(url)) continue;
  if (/my\.holdi\.ai/.test(url)) { console.log(`${ref}: пропуск (приватный прототип)`); continue; }
  const dir = path.join(refsDir, 'shots', ref === 'structured-app' ? 'structured' : ref, 'code');
  if (!force) { try { await fs.access(path.join(dir, 'summary.md')); console.log(`${ref}: уже есть`); continue; } catch {} }
  await fs.mkdir(dir, { recursive: true });
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/inspect.mjs'), url, dir, '--only=desktop'], { encoding: 'utf8', timeout: 6 * 60e3 });
  const ok = r.status === 0 && await fs.access(path.join(dir, 'summary.md')).then(() => true, () => false);
  console.log(`${ref}: ${ok ? 'готово' : 'НЕ УДАЛОСЬ (код ' + r.status + ')'} за ${Math.round((Date.now() - t0) / 1000)} с`);
  log.push({ ref, url, ok });
}
console.log(`Итого: ${log.filter(x => x.ok).length} из ${log.length}. Не удалось: ${log.filter(x => !x.ok).map(x => x.ref).join(', ') || '—'}`);
