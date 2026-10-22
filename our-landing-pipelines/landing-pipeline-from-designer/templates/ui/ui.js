/* Помощники сцен: запуск при появлении в экране, цикл с паузой, конечное состояние без анимации. */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* Число с пробелами-разделителями тысяч (обычный пробел; в разметке у чисел ставь white-space: nowrap). */
const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/[  ]/g, ' ');
/* Плавный подсчёт от нуля до значения. */
function countTo(el, to, ms, suffix = '') { return rollTo(el, 0, to, ms, () => true, suffix); }
/* Плавный подсчёт от from до to; alive() прерывает подсчёт, когда сцена ушла из экрана. */
function rollTo(el, from, to, ms, alive = () => true, suffix = '') {
  return new Promise(res => {
    const t0 = performance.now();
    (function tick(t) {
      if (!alive()) return res();
      const p = Math.min((t - t0) / ms, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e) + suffix;
      p < 1 ? requestAnimationFrame(tick) : res();
    })(t0);
  });
}
/* loopScene(root, run, final, pause)
   run(alive) — один проход сцены (в начале сам сбрось состояние к начальному); alive() — false, когда сцена ушла из экрана: прерви проход.
   final() — конечное состояние, показывается при prefers-reduced-motion.
   Сцена стартует, когда блок виден на 35 % (для высоких блоков на телефоне при необходимости поставь threshold ниже). */
function loopScene(root, run, final, pause = 3000, threshold = 0.35) {
  if (reduced) { final(); return; }
  let token = 0, running = false;
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) { token++; running = false; return; }
    if (running) return;
    running = true; const my = ++token;
    /* защита от пустого цикла: проход короче 100 мс (например, ручной режим) не должен крутиться без паузы и грузить процессор */
    while (token === my) { const t0 = performance.now(); await run(() => token === my); if (token !== my) break; await sleep(Math.max(pause, performance.now() - t0 < 100 ? 1000 : 0)); }
  }, { threshold });
  io.observe(root);
}
/* Показать i-е состояние из набора, лежащего в одной ячейке (класс .off скрывает прозрачностью, см. ui.css). */
function setState(el, i) { [...el.children].forEach((c, k) => c.classList.toggle('off', k !== i)); }
/* Общее состояние страницы: ядро (калькулятор, конфигуратор) пишет введённые посетителем значения, остальные блоки подписываются и пересчитываются.
   PageState.set('orders', 1200); PageState.on('orders', v => { el.textContent = fmt(v); }); PageState.get('orders', 800) */
const PageState = (() => {
  const s = {}, subs = {};
  return {
    get: (k, d) => (k in s ? s[k] : d),
    set(k, v) { s[k] = v; (subs[k] || []).forEach(f => f(v)); (subs['*'] || []).forEach(f => f(k, v)); },
    on(k, f) { (subs[k] ||= []).push(f); if (k in s) f(s[k]); }
  };
})();
