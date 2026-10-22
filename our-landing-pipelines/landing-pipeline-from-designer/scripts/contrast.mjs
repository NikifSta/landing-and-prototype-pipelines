// Контраст пар цветов по WCAG 2.x.
// node scripts/contrast.mjs "#0B7D43:#FFFFFF" "#111214:#F6F7F5" ...
// Пара — «цвет текста:цвет фона» (hex). Пороги: обычный текст ≥ 4.5, крупный (от 24 px / 19 px жирный) ≥ 3, основной текст тела — желательно ≥ 7.
const lum = hex => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const c = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const pairs = process.argv.slice(2);
if (!pairs.length) { console.error('usage: contrast.mjs "#fg:#bg" ...'); process.exit(1); }
let bad = 0;
for (const p of pairs) {
  const [fg, bg] = p.split(':');
  if (!/^#[0-9a-f]{3,6}$/i.test(fg || '') || !/^#[0-9a-f]{3,6}$/i.test(bg || '')) { console.error(`не распознана пара «${p}»`); process.exit(1); }
  const r = ratio(fg, bg);
  const mark = r >= 7 ? 'AAA (≥7)' : r >= 4.5 ? 'AA (≥4.5)' : r >= 3 ? 'только крупный текст (≥3)' : 'НЕ проходит';
  if (r < 4.5) bad++;
  console.log(`${fg} на ${bg}: ${r.toFixed(2)} : 1 — ${mark}`);
}
if (bad) console.log(`\nПар ниже 4.5: ${bad}. Для обычного текста их нужно затемнить или осветлить.`);
