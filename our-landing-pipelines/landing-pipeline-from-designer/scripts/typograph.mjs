// Неразрывные пробелы после коротких слов, перед тире, между числом и единицей. Меняет файл на месте.
// node scripts/typograph.mjs <file.html>
import fs from 'node:fs/promises';
const file = process.argv[2];
if (!file) { console.error('usage: typograph.mjs <file.html>'); process.exit(1); }
const NB = '\u00A0';
const SHORT = /(^|[\s\u00A0(«„"])([А-Яа-яЁёA-Za-z]{1,3}|без|для|над|под|при|про|или|что|как|это|все|чем|где)[ ](?=\S)/g;
function typo(t) { let p; do { p = t; t = t.replace(SHORT, '$1$2' + NB); } while (t !== p);
  // Склейка не длиннее MAX символов, иначе крупный заголовок не переносится и даёт горизонтальную прокрутку.
  // Длинную склейку рвём ближе к середине и по возможности не после короткого слова (предлог остаётся со своим словом):
  // «о чём вы договорились» → «о␣чём вы␣договорились», «за 12 дней» не трогаем. Тире держится за предыдущее слово.
  const MAX = 18, isShort = w => /^[«„"(]?[А-Яа-яЁёA-Za-z]{1,3}$/.test(w);
  const split = u => {
    if (u.length < 2 || u.join(' ').length <= MAX) return [u.join(NB)];
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < u.length - 1; i++) {
      const left = u.slice(0, i + 1).join(' ').length, mid = Math.abs(left - u.join(' ').length / 2);
      // хуже всего оторвать предлог от длинного слова, терпимо — разорвать два коротких слова
      const score = mid + (isShort(u[i]) ? (isShort(u[i + 1]) ? 500 : 1000) : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return [...split(u.slice(0, best + 1)), ...split(u.slice(best + 1))];
  };
  t = t.replace(/\S+(?: \S+)+/g, chain => {
    const u = [];
    for (const w of chain.split(NB)) if (/^[—–]/.test(w) && u.length) u[u.length - 1] += NB + w; else u.push(w);
    return split(u).join(' ');
  });
  return t.replace(/ (—|–)/g, NB + '$1').replace(/(\d) (?=(млн|тыс|₽|%|мин|ч|дн|шт))/g, '$1' + NB); }
let html = await fs.readFile(file, 'utf8');
// script/style/pre/textarea прячем, затем меняем только текст между тегами
const kept = [];
html = html.replace(/<(script|style|pre|textarea)\b[\s\S]*?<\/\1>/gi, m => `\u0000${kept.push(m) - 1}\u0000`);
html = html.replace(/>([^<]+)</g, (m, text) => '>' + typo(text) + '<');
// последнее слово абзаца или заголовка не остаётся одно на строке: склеиваем его с предыдущим (если склейка короткая)
// (только если предпоследнее слово ещё не входит в склейку — иначе получится длинная неразрывная цепочка)
html = html.replace(/(?<=[ >])([^\s> ]+) ([^\s< ]{1,12})(\s*<\/(?:p|h1|h2|h3|h4|li|summary)>)/g, (m, a, b, end) => (a + ' ' + b).length <= 20 ? a + NB + b + end : m);
html = html.replace(/\u0000(\d+)\u0000/g, (m, i) => kept[+i]);
await fs.writeFile(file, html);
console.log('Типограф применён:', file);
