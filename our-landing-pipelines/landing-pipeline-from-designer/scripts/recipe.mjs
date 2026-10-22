// Рецепты страниц и проверка разнообразия лендингов.
//
//   node scripts/recipe.mjs new <папка проекта> [--roles=hero,problem,...] [--seed=N] [--taste=taste.json]
//       Строит рецепт страницы: язык, режим образности, подпись движения и по архетипу на каждую секцию.
//       Роли секций берутся из 03-story.json (если есть), иначе из --roles или набора по умолчанию.
//       Результат: <проект>/recipe.json (+ вывод проверки разнообразия).
//   node scripts/recipe.mjs candidates <папка проекта> [--n=3]
//       N рецептов-кандидатов, непохожих друг на друга и на реестр: recipe-A.json, recipe-B.json… в папке проекта.
//   node scripts/recipe.mjs choose <папка проекта> <A|B|C>
//       Копирует выбранного кандидата в recipe.json и регистрирует его в реестре.
//   node scripts/recipe.mjs check <recipe.json>      Проверка рецепта против реестра и внутри страницы.
//   node scripts/recipe.mjs register <recipe.json>   Добавить рецепт в реестр (projects/_registry.json).
//   node scripts/recipe.mjs list                     Список зарегистрированных рецептов.
//
// Реестр лежит в папке projects/ рядом с проектами (в текущей рабочей папке): projects/_registry.json.
// Каталог — references/_archetypes/part-*.json и part-*.languages.json (корень плагина).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './_env.mjs';
import { IMAGE_GENERATOR_NAME, VIDEO_GENERATOR_NAME } from './media-generation/media-generator-names.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.resolve('projects/_registry.json');
const DEFAULT_ROLES = ['hero', 'problem', 'mechanism', 'process', 'data-viz', 'devices', 'proof-numbers', 'comparison', 'launch', 'cta'];
const MOTIONS = ['autoplay-loop', 'scroll-pin', 'scroll-scrub', 'reveal-words', 'counter', 'marquee', 'parallax-layers', 'hover-reactive', 'video-loop', 'static'];
// пороги разнообразия: минимум отличающихся осей из 5 и максимум общих «семейств» блоков с любой прошлой страницей
const MIN_AXES_DIFF = 3;
const MAX_FAMILY_OVERLAP = 0.4;

const args = process.argv.slice(2);
const cmd = args[0];
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const pos = args.slice(1).filter(a => !a.startsWith('--'));

const readJson = async p => JSON.parse((await fs.readFile(p, 'utf8')).replace(/^﻿/, ''));
async function loadCatalog() {
  const dir = path.join(ROOT, 'references/_archetypes');
  const files = await fs.readdir(dir);
  const archetypes = [], languages = [];
  for (const f of files.filter(f => /^part-.*\.json$/.test(f))) {
    const data = await readJson(path.join(dir, f));
    (f.endsWith('.languages.json') ? languages : archetypes).push(...(Array.isArray(data) ? data : []));
  }
  if (!archetypes.length) throw new Error('каталог архетипов пуст: нет references/_archetypes/part-*.json');
  return { archetypes, languages };
}
// возможности генерации медиа: из .env или окружения (без Astra фото, 3D и первые кадры роликов недоступны,
// без Dreamina — видео)
async function capabilities() {
  loadEnv();
  const env = { ...process.env };
  const image = env.MEDIA_IMAGE_GENERATOR === IMAGE_GENERATOR_NAME;
  const caps = { image, video: image && env.MEDIA_VIDEO_GENERATOR === VIDEO_GENERATOR_NAME };
  if (flags.caps) { const s = String(flags.caps).split(','); caps.image = s.includes('image'); caps.video = s.includes('video'); }
  return caps;
}
async function loadRegistry() {
  // реестр рабочей папки; если его ещё нет, берём «посев» из плагина (рецепты лендингов, собранных при разработке),
  // чтобы первые страницы нового пользователя тоже отличались от них
  let reg;
  try { reg = await readJson(REGISTRY); } catch { reg = { recipes: [] }; }
  try {
    const seed = await readJson(path.join(ROOT, 'references/_archetypes/registry.seed.json'));
    const have = new Set(reg.recipes.map(r => r.slug));
    for (const r of seed.recipes || []) if (!have.has(r.slug)) reg.recipes.push({ ...r, seeded: true });
  } catch { /* посева нет — не страшно */ }
  return reg;
}
// детерминированный генератор случайных чисел
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = s => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const pickWeighted = (items, weights, r) => { const sum = weights.reduce((a, b) => a + b, 0) || 1; let x = r() * sum; for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; } return items.at(-1); };
const asArr = v => Array.isArray(v) ? v : v == null ? [] : [v];
const norm = v => String(v ?? '').split('|')[0].trim();

// «Грамматика контейнера» — как блок стоит на странице. Главный источник визуального однообразия: «белая карточка с интерфейсом на цветной плитке» (framed-window) допустима не чаще 3 раз.
const CONTAINER_LIMIT = { 'framed-window': 3, 'grid-cards': 2, 'ribbon': 2, 'split-field': 2 };
function containerOf(a) {
  const key = `${a.id} ${a.family}`.toLowerCase(), img = norm(a.imagery), bg = norm(a.background), mo = norm(a.motion);
  if (a.container) return a.container;
  if (a.interactive) return 'tool';   // рабочий инструмент (калькулятор, конфигуратор): не «окно в карточке»
  if (/marquee|ticker|ribbon|strip|timeline|carousel|belt/.test(key) || mo === 'marquee') return 'ribbon';
  if (/split|seam|twin|duo|before-after|compare|parallel/.test(key)) return 'split-field';
  if (/grid|bento|cards|tiles|mosaic|stack|shelf|catalog/.test(key)) return 'grid-cards';
  if (img === 'type-only' || img === 'none') return 'typographic';
  if (img === 'chart' || bg === 'photo' || /full-bleed|fullbleed|map|chart|diagram/.test(key)) return 'full-bleed';
  if (['photo-objects', 'photo-people', 'collage', '3d', 'illustration', 'video'].includes(img)) return 'object-on-field';
  return 'framed-window';
}
function usageCounts(registry, getter) { const m = new Map(); for (const rc of registry.recipes) for (const k of getter(rc)) m.set(k, (m.get(k) || 0) + 1); return m; }

// ядро доказательства (proof_core) из 03-story.json: calculator | configurator | live-demo | compare | quiz | none
async function proofCore(projectDir) {
  try { const j = await readJson(path.join(projectDir, '03-story.json')); const p = j.proof_core; if (p && p.type && p.type !== 'none') return p; } catch {}
  return null;
}

async function sectionRoles(projectDir) {
  if (flags.roles) return String(flags.roles).split(',').map(s => s.trim()).filter(Boolean);
  try { const j = await readJson(path.join(projectDir, '03-story.json')); return j.sections.map(s => s.role); } catch { return DEFAULT_ROLES; }
}

// check и register принимают и файл recipe.json, и папку проекта (как остальные команды)
async function recipeFile(p) { try { if ((await fs.stat(p)).isDirectory()) return path.join(p, 'recipe.json'); } catch {} return p; }

// id секций из 03-story.json (в рецепте они s1-hero…, поэтому храним соответствие в story_id)
async function storyIds(projectDir) {
  try { const j = await readJson(path.join(projectDir, '03-story.json')); return j.sections.map(s => s.id || null); } catch { return []; }
}

// Правила CLAUDE.md поверх композиции архетипа: где они спорят, побеждают правила; арт-директор исполняет композицию с этими поправками.
function ruleNotes(role, a) {
  const n = [];
  const motion = norm(a.motion);
  if (role === 'hero') n.push('H1 прямо говорит, что делает продукт или какую пользу даёт (понятно за 5 секунд); подзаголовок ≤ 2 строк; продукт (интерфейс, предмет или сцена) виден на первом экране — даже если архетип «чистая типографика» или «логотип»');
  if (['mechanism', 'process'].includes(role) && /scroll-(pin|scrub)/.test(motion)) n.push('демонстрацию проигрывай сама при появлении блока (цикл с паузой); прокрутка меняет только простое (шаг, прогресс, маркер)');
  if (role === 'devices') n.push('2–3 экрана с РАЗНЫМИ сценариями (итог, канал, уведомление/задача); не серия одинаковых экранов');
  if (a.interactive) n.push('рабочий инструмент: поля и кнопки реально работают, результат пересчитывается от ввода посетителя и сохраняется в общем состоянии страницы для других блоков; автосцена только как подсказка в начале; на 390 px перестраивается, не обрезается');
  if (norm(a.background) === 'dark') n.push('тёмный блок допустим, если пользователь не отказывался от тёмного (taste.json → avoidMood)');
  return n;
}

async function makeRecipe(projectDir, primaryArg) {
  const { archetypes, languages } = await loadCatalog();
  const registry = await loadRegistry();
  const caps = await capabilities();
  const slug = path.basename(path.resolve(projectDir));
  const seed = flags.seed ? Number(flags.seed) : hash(slug + new Date().toISOString().slice(0, 10));
  const r = rng(seed);
  let taste = {}; if (flags.taste) taste = await readJson(String(flags.taste)); else { try { taste = await readJson(path.join(projectDir, 'taste.json')); } catch {} }
  const liked = new Set(asArr(taste.likedRefs)), disliked = new Set(asArr(taste.dislikedRefs));
  const avoidImagery = new Set(asArr(taste.avoidImagery)), preferImagery = new Set(asArr(taste.preferImagery));
  // fits — строка или массив (потребительский финтех подходит и к consumer, и к fintech); совпадение хотя бы с одним тегом
  let fitsTags = asArr(taste.fits);
  try { const intake = await readJson(path.join(projectDir, '01-intake.json')); if (!fitsTags.length && intake.productType) fitsTags = asArr(intake.productType); } catch {}
  const fitsOk = list => !fitsTags.length || !asArr(list).length || asArr(list).some(f => fitsTags.includes(f));
  const avoidPalette = new Set(asArr(taste.avoidPalette).map(String));   // например «warm-neutral», «black-white»: палитры, которых пользователь не хочет
  const avoidMood = asArr(taste.avoidMood).map(s => String(s).toLowerCase());
  const avoidDark = avoidMood.some(s => /тёмн|темн|dark|чёрн|черн/.test(s)) || asArr(taste.avoidBackground).includes('dark');
  const avoidVideo = avoidImagery.has('video');
  if (avoidVideo) caps.video = false; // «без видео» из вкуса действует как отсутствие возможности

  // язык: штраф за палитру и тип, уже использованные недавно
  const usedPalette = usageCounts(registry, rc => [rc.language?.palette_family]);
  const usedType = usageCounts(registry, rc => [rc.language?.type_class]);
  // язык без превью на доске рецептов пользователь выбрать «вслепую» не может: такие языки берём только если нет выбора
  const NO_BOARD = new Set(['alethia', 'streamtime', 'trevornoah', 'holdi-focus']);
  const hasThumb = async ref => { try { await fs.access(path.join(ROOT, 'references/thumbs', ref + '.jpg')); return !NO_BOARD.has(ref); } catch { return false; } };
  const thumbOk = new Map(); for (const l of languages) thumbOk.set(l.ref, await hasThumb(l.ref));
  const langWeights = languages.map(l => {
    let w = 1;
    if (!thumbOk.get(l.ref)) w *= 0.02;
    w *= 1 / (1 + 2 * (usedPalette.get(norm(l.palette_family)) || 0));
    w *= 1 / (1 + 1.5 * (usedType.get(norm(l.type_class)) || 0));
    if (liked.has(l.ref)) w *= 3;
    if (disliked.has(l.ref)) w *= 0.02;
    if (!fitsOk(l.fits)) w *= 0.3;
    if (avoidPalette.has(norm(l.palette_family))) w *= 0.02;
    // запрещённая в правилах связка «ИИ-стиля»: тёплый нейтральный/земляной фон + антиква
    if (['warm-neutral', 'earth'].includes(norm(l.palette_family)) && norm(l.type_class) === 'serif-editorial') w *= 0.05;
    // правило «страница не бывает монохромной»: монохромные языки допустимы редко и только с добавленными акцентами бренда
    if (['monochrome', 'black-white'].includes(norm(l.palette_family))) w *= 0.15;
    const moodText = [].concat(l.mood || []).join(' ').toLowerCase();
    if (avoidMood.some(s => s && moodText.includes(s))) w *= 0.05;
    if (avoidDark && (['graphite-teal', 'black-white'].includes(norm(l.palette_family)) || /тёмн|темн/.test(moodText))) w *= 0.002;
    return w;
  });
  // reference-first: язык и большинство блоков берутся у выбранного пользователем референса (primary); остальные блоки — у похожих по настроению
  let primary = primaryArg || (flags.primary ? String(flags.primary) : null) || taste.primaryRef || null;
  if (!primary) { try { const intake = await readJson(path.join(projectDir, '01-intake.json')); if (intake.reference) primary = String(intake.reference).replace(/\.md$/, ''); } catch {} }
  if (primary && !languages.some(l => l.ref === primary)) primary = null;
  const language = primary ? languages.find(l => l.ref === primary) : pickWeighted(languages, langWeights, r);
  const words = l => new Set([].concat(l.mood || []).join(' ').toLowerCase().split(/[^а-яёa-z]+/).filter(w => w.length > 3));
  const similarRefs = new Set();
  if (primary) {
    const pw = words(language);
    languages.filter(l => l.ref !== primary).map(l => ({ ref: l.ref, s: (norm(l.palette_family) === norm(language.palette_family) ? 2 : 0) + (norm(l.type_class) === norm(language.type_class) ? 1 : 0) + [...words(l)].filter(w => pw.has(w)).length + (fitsOk(l.fits) ? 0.5 : 0) }))
      .sort((a, b) => b.s - a.s).slice(0, 6).forEach(x => similarRefs.add(x.ref));
  }

  // подпись движения и режим образности
  const usedMotion = usageCounts(registry, rc => [rc.motion_signature]);
  const motionPool = MOTIONS.filter(m => caps.video || m !== 'video-loop');
  const motion_signature = pickWeighted(motionPool, motionPool.map(m => 1 / (1 + 2 * (usedMotion.get(m) || 0))), r);
  let imageryPool = ['ui-code', 'photo-objects', 'illustration', '3d', 'video', 'collage', 'type-only', 'chart'];
  if (!caps.image) imageryPool = imageryPool.filter(m => !['photo-objects', '3d', 'collage'].includes(m));
  if (!caps.video) imageryPool = imageryPool.filter(m => m !== 'video');
  const usedImg = usageCounts(registry, rc => [rc.imagery_primary]);
  const imagery_primary = pickWeighted(imageryPool, imageryPool.map(m => (avoidImagery.has(m) ? 0.01 : 1) * (preferImagery.has(m) ? 3 : 1) / (1 + 2 * (usedImg.get(m) || 0))), r);

  // блоки
  const roles = await sectionRoles(projectDir), sIds = await storyIds(projectDir), proof = await proofCore(projectDir);
  const proofRoles = proof ? new Set(asArr(proof.roles).length ? asArr(proof.roles) : (proof.placement === 'hero' ? ['hero', 'mechanism'] : ['mechanism'])) : new Set();
  const famUsed = usageCounts(registry, rc => (rc.sections || []).map(s => s.family));
  const idUsed = usageCounts(registry, rc => (rc.sections || []).map(s => s.archetype));
  const chosen = [], pageFamilies = new Set(), donorCount = new Map(), motionCount = new Map(), contCount = new Map();
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const feasible = a => !a.risky && !(!caps.video && (asArr(a.needs).includes('video') || norm(a.imagery) === 'video')) && !(!caps.image && (asArr(a.needs).some(n => ['photo', '3d'].includes(n)) || ['photo-objects', 'photo-people', '3d'].includes(norm(a.imagery))));
    let cands = archetypes.filter(a => a.role === role && !pageFamilies.has(a.family) && feasible(a));
    if (!cands.length) cands = archetypes.filter(a => a.role === role && feasible(a));
    if (!cands.length) cands = archetypes.filter(a => a.role === role);
    if (!cands.length) { chosen.push({ id: `section-${i + 1}`, role, archetype: null, family: null, note: 'в каталоге нет архетипа для роли: доработать вручную' }); continue; }
    const w = cands.map(a => {
      let x = 1;
      x *= 1 / (1 + 1.5 * (famUsed.get(a.family) || 0));
      x *= 1 / (1 + 1.0 * (idUsed.get(a.id) || 0));
      const donors = asArr(a.donors).map(d => d.ref);
      if (donors.some(d => liked.has(d))) x *= 2.5;
      if (donors.some(d => disliked.has(d))) x *= 0.05;
      // ядро доказательства строится из потребности продукта (рабочий инструмент), а не из референса: референс задаёт стилистику
      const isTool = !!a.interactive;
      if (proof && proofRoles.has(role)) x *= isTool ? 40 : 0.05;
      else if (isTool && !proof) x *= 0.3;   // без ядра инструменты не навязываем
      if (primary && !isTool) {
        // блок выбранного референса — главный источник; у похожих референсов — допустим; у остальных — почти исключён (страница должна быть похожа на выбранный референс)
        if (donors.includes(primary)) x *= 8;
        else if (donors.some(d => similarRefs.has(d))) x *= 1.5;
        else x *= 0.1;
        // приёмы, которых нет у выбранного референса (бегущая строка), не добавляются «для разнообразия»
        if (norm(a.motion) === 'marquee' && !donors.includes(primary)) x *= 0.0001;
        if (donors.some(d => d !== primary && (donorCount.get(d) || 0) >= 2)) x *= 0.3;
      } else if (!isTool && donors.some(d => (donorCount.get(d) || 0) >= 2)) x *= 0.15; // не больше двух блоков от одного донора
      if (norm(a.motion) === motion_signature) x *= 1.8;
      if ((motionCount.get(norm(a.motion)) || 0) >= 3) x *= 0.2;      // не больше трёх блоков с одним движением
      if (avoidImagery.has(norm(a.imagery))) x *= 0.1;
      if (avoidVideo && (norm(a.motion) === 'video-loop' || asArr(a.needs).includes('video'))) x *= 0.01;
      if (avoidDark && norm(a.background) === 'dark') x *= 0.1;
      if (['hero', 'mechanism'].includes(role) && norm(a.motion) === 'static') x *= 0.15; // демонстрация продукта должна играть сама
      if (role === 'hero' && norm(a.imagery) === imagery_primary) x *= 2;
      // правила CLAUDE.md сильнее каталога: первый экран объясняет продукт (не «голая» типографика/логотип), демонстрация играет сама
      if (role === 'hero' && ['type-only', 'none'].includes(norm(a.imagery))) x *= 0.05;
      if (['mechanism', 'process'].includes(role) && /scroll-(pin|scrub)/.test(norm(a.motion))) x *= 0.1;
      if (!fitsOk(a.fits)) x *= 0.15;   // блок для другого типа продукта (B2B-схемы в потребительском приложении)
      // грамматика контейнера: не больше предела блоков одного вида и не два подряд
      const ct = containerOf(a);
      if ((contCount.get(ct) || 0) >= (CONTAINER_LIMIT[ct] ?? 99)) x *= 0.03;
      if (chosen.at(-1)?.container === ct) x *= 0.3;
      return x;
    });
    const a = pickWeighted(cands, w, r);
    contCount.set(containerOf(a), (contCount.get(containerOf(a)) || 0) + 1);
    pageFamilies.add(a.family);
    for (const d of asArr(a.donors)) donorCount.set(d.ref, (donorCount.get(d.ref) || 0) + 1);
    motionCount.set(norm(a.motion), (motionCount.get(norm(a.motion)) || 0) + 1);
    chosen.push({ id: `s${i + 1}-${role}`, story_id: sIds[i] || null, role, archetype: a.id, name: a.name, family: a.family, container: containerOf(a), motion: norm(a.motion), imagery: norm(a.imagery), background: norm(a.background), donors: asArr(a.donors).map(d => d.ref), ...(a.interactive ? { interactive: true } : {}), rules: ruleNotes(role, a) });
  }
  return {
    slug, seed, created: new Date().toISOString().slice(0, 10), capabilities: caps,
    language: { ref: language.ref, palette_family: norm(language.palette_family), type_class: norm(language.type_class), mood: language.mood,
      ...(['monochrome', 'black-white'].includes(norm(language.palette_family)) ? { accents_required: 'язык монохромный: бренд обязан добавить 2–3 акцентных цвета со смыслом (состояние, блок); страница не бывает монохромной' } : {}) },
    motion_signature, imagery_primary,
    ...(proof ? { proof_core: proof } : {}),
    sections: chosen,
    hero_family: chosen[0]?.family || null,
    avoid_donors: [...disliked],
    donors: [...donorCount.keys()],
    ...(primary ? { primary, base_share: Number((chosen.filter(s => !s.interactive && (s.donors || []).some(d => d === primary || similarRefs.has(d))).length / Math.max(1, chosen.filter(s => !s.interactive).length)).toFixed(2)), primary_share: Number((chosen.filter(s => (s.donors || []).includes(primary)).length / Math.max(1, chosen.length)).toFixed(2)), similar_refs: [...similarRefs] } : {})
  };
}

function distance(a, b) {
  const axes = {
    palette_family: a.language?.palette_family !== b.language?.palette_family,
    type_class: a.language?.type_class !== b.language?.type_class,
    hero_family: a.hero_family !== b.hero_family,
    imagery_primary: a.imagery_primary !== b.imagery_primary,
    motion_signature: a.motion_signature !== b.motion_signature
  };
  const fa = new Set((a.sections || []).map(s => s.family).filter(Boolean)), fb = new Set((b.sections || []).map(s => s.family).filter(Boolean));
  const inter = [...fa].filter(x => fb.has(x)).length, uni = new Set([...fa, ...fb]).size || 1;
  return { axes, diff: Object.values(axes).filter(Boolean).length, overlap: inter / uni };
}
function check(recipe, registry) {
  const problems = [];
  const fams = (recipe.sections || []).map(s => s.family).filter(Boolean);
  const dup = fams.filter((f, i) => fams.indexOf(f) !== i);
  if (dup.length) problems.push(`внутри страницы повторяются семейства блоков: ${[...new Set(dup)].join(', ')}`);
  const nulls = (recipe.sections || []).filter(s => !s.archetype).map(s => s.role);
  if (nulls.length) problems.push(`нет архетипа для ролей: ${nulls.join(', ')}`);
  const cc = new Map(); for (const s of recipe.sections || []) if (s.container) cc.set(s.container, (cc.get(s.container) || 0) + 1);
  for (const [c, n] of cc) if (n > (CONTAINER_LIMIT[c] ?? 99)) problems.push(`слишком много блоков вида «${c}» (${n}, допустимо ${CONTAINER_LIMIT[c]}): страница сойдётся к одной схеме`);
  if (recipe.proof_core) {
    const tools = (recipe.sections || []).filter(s => s.interactive);
    if (!tools.length) problems.push(`ядро доказательства «${recipe.proof_core.type}» не воплощено: нет ни одного интерактивного блока (калькулятор, конфигуратор, живое демо); посетитель должен уметь потрогать продукт`);
  }
  if (recipe.primary) {
    const share = (recipe.sections || []).filter(s => (s.donors || []).includes(recipe.primary)).length / Math.max(1, (recipe.sections || []).filter(s => !s.interactive).length);
    if (share < 0.25) problems.push(`страница слабо следует выбранному референсу «${recipe.primary}»: его блоков ${(share * 100).toFixed(0)} % (нужно ≥ 25 %, цель ≥ 30 %); добавьте его блоки в каталог (/ref-hunt) или выберите референс с более богатым набором`);
    const mq = (recipe.sections || []).filter(s => s.motion === 'marquee' && !(s.donors || []).includes(recipe.primary));
    if (mq.length) problems.push('бегущая строка у блока(ов) ' + mq.map(s => s.id).join(', ') + ': у выбранного референса её нет');
  }
  // блок от донора, который пользователь отметил как «не нравится» (после ручного swap это легко пропустить)
  for (const s of recipe.sections || []) { const bad = (s.donors || []).filter(d => (recipe.avoid_donors || []).includes(d)); if (bad.length) problems.push(`блок «${s.id}» взят у донора, который не нравится пользователю: ${bad.join(', ')}`); }
  const mc = new Map(); for (const s of recipe.sections || []) if (s.motion) mc.set(s.motion, (mc.get(s.motion) || 0) + 1);
  for (const [m, n] of mc) if (n > 3 && m !== 'static') problems.push(`больше трёх блоков с одним движением «${m}» (${n})`);
  for (const s of recipe.sections || []) if (['hero', 'mechanism'].includes(s.role) && s.motion === 'static') problems.push(`блок «${s.id}» (${s.role}) статичен: демонстрация продукта должна играть сама`);
  if (recipe.language && ['warm-neutral', 'earth'].includes(recipe.language.palette_family) && recipe.language.type_class === 'serif-editorial') problems.push('связка «тёплый нейтральный фон + антиква» запрещена правилами (ИИ-стиль)');
  const rows = [];
  for (const other of registry.recipes.filter(o => o.slug !== recipe.slug)) {
    const d = distance(recipe, other);
    rows.push({ slug: other.slug, ...d });
    if (d.diff < MIN_AXES_DIFF) problems.push(`похожа на «${other.slug}»: отличается лишь по ${d.diff} из 5 осей (нужно ≥ ${MIN_AXES_DIFF})`);
    if (d.overlap > MAX_FAMILY_OVERLAP) problems.push(`похожа на «${other.slug}»: ${(d.overlap * 100).toFixed(0)} % общих семейств блоков (допустимо ≤ ${MAX_FAMILY_OVERLAP * 100} %)`);
  }
  return { ok: problems.length === 0, problems, rows };
}
function huntNote(recipe) {
  const base = recipe.base_share ?? recipe.primary_share;
  if (!recipe.primary || base == null || (base >= 0.7 && recipe.primary_share >= 0.3)) return '';
  return `\n!!! ТРЕБУЕТСЯ /ref-hunt: страница опирается на выбранный референс «${recipe.primary}» и похожие только на ${(base * 100).toFixed(0)} % блоков (его собственных ${(recipe.primary_share * 100).toFixed(0)} %); цель: выбранный + похожие ≥ 70 %, сам выбранный ≥ 30 %. Запусти скилл ref-hunt (сначала шаг 0: углубить сам выбранный референс по его полосам блоков, затем при необходимости 2–3 похожих сайта: ${(recipe.similar_refs || []).slice(0, 3).join(', ')}), затем пересоздай кандидатов. В режимах --auto и --ask без вопроса пользователю.`;
}
function report(recipe, res) {
  console.log(`Рецепт «${recipe.slug}» (seed ${recipe.seed}): язык ${recipe.language.ref} (${recipe.language.palette_family}, ${recipe.language.type_class}), образность ${recipe.imagery_primary}, движение ${recipe.motion_signature}`);
  for (const s of recipe.sections) console.log(`  ${s.id.padEnd(22)} ${String(s.archetype).padEnd(34)} [${s.family}] ${s.donors?.join(', ') || ''}`);
  for (const row of res.rows) console.log(`  vs ${row.slug}: осей отличий ${row.diff}/5, общих семейств ${(row.overlap * 100).toFixed(0)} %`);
  console.log(res.ok ? 'Разнообразие: OK' : 'Разнообразие: ПРОБЛЕМЫ\n  - ' + res.problems.join('\n  - '));
  const hn = huntNote(recipe); if (hn) console.log(hn);
}

if (cmd === 'new') {
  const projectDir = pos[0]; if (!projectDir) { console.error('usage: recipe.mjs new <папка проекта>'); process.exit(1); }
  const registry = await loadRegistry();
  let best = null, attempt = 0;
  const baseSeed = flags.seed ? Number(flags.seed) : null;
  for (; attempt < (baseSeed ? 1 : 40); attempt++) {
    if (!baseSeed) flags.seed = String(hash(path.basename(path.resolve(projectDir)) + Date.now() + attempt));
    const recipe = await makeRecipe(projectDir);
    const res = check(recipe, registry);
    if (!best || res.problems.length < best.res.problems.length) best = { recipe, res };
    if (res.ok) break;
  }
  await fs.writeFile(path.join(projectDir, 'recipe.json'), JSON.stringify(best.recipe, null, 2), 'utf8');
  report(best.recipe, best.res);
  console.log(`Записано: ${path.join(projectDir, 'recipe.json')} (попыток: ${attempt + 1})`);
  process.exit(best.res.ok ? 0 : 3);
} else if (cmd === 'candidates') {
  const projectDir = pos[0]; if (!projectDir) { console.error('usage: recipe.mjs candidates <папка проекта> [--n=3]'); process.exit(1); }
  const n = Number(flags.n || 3);
  const registry = await loadRegistry();
  const picked = [];
  // кандидаты = три разных ВЫБРАННЫХ референса (primary): сначала названные пользователем (--primaries=a,b,c, likedRefs из taste.json, reference из intake),
  // затем похожие по языку; недавно использованные в реестре и нелюбимые — в конец
  const { languages: langs } = await loadCatalog();
  let tasteC = {}; try { tasteC = await readJson(path.join(projectDir, 'taste.json')); } catch {}
  let intakeC = {}; try { intakeC = await readJson(path.join(projectDir, '01-intake.json')); } catch {}
  const recentPrimary = usageCounts(registry, rc => [rc.primary || rc.language?.ref]);
  const dislikedC = new Set(asArr(tasteC.dislikedRefs));
  const want = [...(flags.primaries ? String(flags.primaries).split(',') : []), ...asArr(tasteC.likedRefs), intakeC.reference ? String(intakeC.reference).replace(/\.md$/, '') : null].filter(Boolean);
  const known = new Set(langs.map(l => l.ref));
  const order = [...new Set(want)].filter(r => known.has(r) && !dislikedC.has(r));
  // добираем похожие на уже названные (по палитре/шрифту), если названо меньше n
  const canShow = async ref => { try { await fs.access(path.join(ROOT, 'references/thumbs', ref + '.jpg')); return true; } catch { return false; } };
  for (const l of langs) { if (order.length >= n) break; if (!order.includes(l.ref) && !dislikedC.has(l.ref) && await canShow(l.ref) && !['alethia', 'streamtime', 'trevornoah', 'holdi-focus'].includes(l.ref)) { const base = langs.find(x => x.ref === order[0]); if (!base || norm(l.palette_family) !== norm(base.palette_family) || order.length === 0) order.push(l.ref); } }
  const primaries = order.sort((x, y) => (recentPrimary.get(x) || 0) - (recentPrimary.get(y) || 0)).slice(0, n);
  console.log('Выбранные референсы кандидатов: ' + primaries.join(', '));
  for (let k = 0; k < n; k++) {
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      flags.seed = String(hash(path.basename(path.resolve(projectDir)) + 'cand' + k + Date.now() + attempt));
      const recipe = await makeRecipe(projectDir, primaries[k]);
      const res = check(recipe, registry);
      // кандидаты между собой: разные языки, разные герои, не больше трети общих семейств (иначе пользователь выбирает из одинакового)
      const near = picked.filter(p => { const d = distance(recipe, p); return d.diff < MIN_AXES_DIFF || d.overlap > 0.34 || recipe.language.ref === p.language.ref || recipe.hero_family === p.hero_family || (recipe.sections[0]?.donors?.[0] && recipe.sections[0].donors[0] === p.sections[0]?.donors?.[0]); }).length;
      const score = res.problems.length + near;
      if (!best || score < best.score) best = { recipe, res, score };
      if (score === 0) break;
    }
    picked.push(best.recipe);
    const letter = String.fromCharCode(65 + k);
    await fs.writeFile(path.join(projectDir, `recipe-${letter}.json`), JSON.stringify(best.recipe, null, 2), 'utf8');
    console.log(`\n=== Кандидат ${letter} ===`); report(best.recipe, best.res);
  }
} else if (cmd === 'choose') {
  const [projectDir, letter] = pos; if (!projectDir || !letter) { console.error('usage: recipe.mjs choose <папка проекта> <A|B|C>'); process.exit(1); }
  const recipe = await readJson(path.join(projectDir, `recipe-${letter.toUpperCase()}.json`));
  recipe.chosen = letter.toUpperCase();
  await fs.writeFile(path.join(projectDir, 'recipe.json'), JSON.stringify(recipe, null, 2), 'utf8');
  const registry = await loadRegistry();
  registry.recipes = registry.recipes.filter(x => x.slug !== recipe.slug); registry.recipes.push(recipe);
  await fs.mkdir(path.dirname(REGISTRY), { recursive: true }); await fs.writeFile(REGISTRY, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`Выбран рецепт ${recipe.chosen} и записан в реестр (${registry.recipes.length} рецептов)`);
  const hn = huntNote(recipe);
  if (hn) { console.log(hn); await fs.writeFile(path.join(projectDir, 'ref-hunt-needed.md'), `# Нужен /ref-hunt\n\nВыбранный референс «${recipe.primary}» и похожие дают только ${(((recipe.base_share ?? recipe.primary_share)) * 100).toFixed(0)} % блоков (его собственных ${(recipe.primary_share * 100).toFixed(0)} %; цель: вместе ≥ 70 %, он сам ≥ 30 %). Запусти скилл ref-hunt, добавь 2–3 похожих сайта (${(recipe.similar_refs || []).slice(0, 3).join(', ')}), пересоздай кандидатов (recipe.mjs candidates) и выбери рецепт заново. После этого удали этот файл.\n`, 'utf8'); }
  else { try { await fs.unlink(path.join(projectDir, 'ref-hunt-needed.md')); } catch {} }
} else if (cmd === 'swap' || cmd === 'refresh') {
  // swap <проект> <id секции> <id архетипа>: заменить архетип секции вручную; refresh <проект>: пересчитать производные поля
  const [projectDir, sectionId, archetypeId] = pos; if (!projectDir || (cmd === 'swap' && (!sectionId || !archetypeId))) { console.error('usage: recipe.mjs swap <проект> <id секции> <id архетипа> | refresh <проект>'); process.exit(1); }
  const { archetypes } = await loadCatalog();
  const file = path.join(projectDir, 'recipe.json'); const recipe = await readJson(file);
  if (cmd === 'swap') {
    const a = archetypes.find(x => x.id === archetypeId); const s = recipe.sections.find(x => x.id === sectionId);
    if (!a) { console.error('нет архетипа ' + archetypeId); process.exit(1); } if (!s) { console.error('нет секции ' + sectionId); process.exit(1); }
    s.replaced = { from: s.archetype, reason: flags.reason || 'ручная замена' };
    Object.assign(s, { archetype: a.id, name: a.name, family: a.family, container: containerOf(a), motion: norm(a.motion), imagery: norm(a.imagery), background: norm(a.background), donors: asArr(a.donors).map(d => d.ref), rules: ruleNotes(s.role, a) });
  }
  // tune: --section=<id> --motion=… --background=… --container=… — отразить ручные решения арт-дирекции в рецепте
  if (flags.section) {
    const s = recipe.sections.find(x => x.id === flags.section); if (!s) { console.error('нет секции ' + flags.section); process.exit(1); }
    for (const k of ['motion', 'background', 'container', 'imagery']) if (flags[k]) { (s.tuned ||= {})[k] = { from: s[k], reason: flags.reason || 'ручное решение' }; s[k] = flags[k]; }
  }
  recipe.hero_family = recipe.sections[0]?.family || null;
  recipe.donors = [...new Set(recipe.sections.flatMap(s => s.donors || []))];
  await fs.writeFile(file, JSON.stringify(recipe, null, 2), 'utf8');
  const registry = await loadRegistry();
  if (registry.recipes.some(x => x.slug === recipe.slug)) { registry.recipes = registry.recipes.map(x => x.slug === recipe.slug ? recipe : x); await fs.writeFile(REGISTRY, JSON.stringify(registry, null, 2), 'utf8'); console.log('реестр обновлён'); }
  const res = check(recipe, registry); report(recipe, res); process.exit(res.ok ? 0 : 3);
} else if (cmd === 'check') {
  const recipe = await readJson(await recipeFile(pos[0])); const res = check(recipe, await loadRegistry()); report(recipe, res); process.exit(res.ok ? 0 : 3);
} else if (cmd === 'register') {
  const recipe = await readJson(await recipeFile(pos[0])); const registry = await loadRegistry();
  registry.recipes = registry.recipes.filter(x => x.slug !== recipe.slug); registry.recipes.push(recipe);
  await fs.mkdir(path.dirname(REGISTRY), { recursive: true }); await fs.writeFile(REGISTRY, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`Зарегистрировано: ${recipe.slug} (всего ${registry.recipes.length})`);
} else if (cmd === 'list') {
  const registry = await loadRegistry();
  for (const rc of registry.recipes) console.log(`${rc.slug}: ${rc.language?.ref} · ${rc.language?.palette_family} · ${rc.imagery_primary} · ${rc.motion_signature} · hero ${rc.hero_family}`);
  if (!registry.recipes.length) console.log('реестр пуст');
} else {
  console.error('команды: new | candidates | choose | swap | refresh | check | register | list'); process.exit(1);
}


