# Формат каталога архетипов блоков

Цель: из референсов извлечь **композиции блоков**, которые можно комбинировать, чтобы лендинги были непохожи друг на друга. Каталог — машинно читаемый JSON; по нему генератор рецептов выбирает блоки и проверяет разнообразие.

Каждый субагент пишет один файл `references/_archetypes/part-<буква>.json` — массив записей.

## Запись архетипа (один блок страницы)
```json
{
  "id": "steps-rail-window",
  "role": "process",
  "name": "Рельса шагов и окно",
  "family": "list-plus-window",
  "composition": "Слева вертикальный список из 3–4 шагов с полосой прогресса, справа окно с демо; шаги сменяются по таймеру.",
  "ascii": "┌ шаги ┐┌ окно ─┐\n│ 1 ─  ││        │\n│ 2    ││        │\n└──────┘└────────┘",
  "background": "color-field | light | dark | photo | gradient | paper",
  "density": "low | medium | high",
  "motion": "autoplay-loop | scroll-pin | scroll-scrub | reveal-words | counter | marquee | parallax-layers | hover-reactive | static | video-loop",
  "imagery": "ui-code | photo-objects | photo-people | illustration | 3d | video | collage | type-only | chart | none",
  "needs": ["device-frame", "chart", "photo", "video", "3d", "illustration", "long-text", "numbers"],
  "fits": ["B2B-saas", "consumer", "fintech", "devtools", "marketplace", "service"],
  "donors": [{ "ref": "monologue", "where": "блок «Сценарии диктовки»", "note": "что именно берём (идея) и что нельзя копировать" }],
  "avoid_same_page_as": ["steps-tabs-window"],
  "distinctive": "чем запоминается; в чём риск шаблонности"
}
```

### Поля и словарь
- **role** (одно из): `hero`, `problem`, `mechanism` (главная демонстрация работы продукта), `process` (шаги/как это работает), `proof-numbers` (цифры, счётчики), `proof-social` (отзывы, логотипы, кейсы), `comparison` (до/после, мы/они, две стороны), `data-viz` (график, диаграмма, карта), `devices` (приложение на телефоне, ноутбук), `feature-grid` (набор возможностей), `manifesto` (крупный текст-позиция), `story` (повествование, кейс, портрет), `pricing`, `integrations`, `launch` (как начать), `cta` (форма, финальный призыв), `footer`.
- **family** — ключ «внешней похожести». Два блока одной страницы **не могут** иметь один family; блоки с разным id, но одним family считаются одинаковыми. Примеры family: `list-plus-window` (список + окно), `tabs-plus-panel`, `card-grid`, `bento`, `big-number-field`, `full-bleed-chart`, `pinned-scroll-story`, `marquee-strip`, `split-screen`, `phone-row`, `sticky-visual-text`, `horizontal-timeline`, `stacked-cards`, `text-manifesto`, `photo-hero`, `video-hero`, `type-hero`, `product-window-hero`, `collage`, `object-on-seam`. Если подходящего нет — придумай новый ключ (латиница, через дефис).
- **needs** — что требуется для исполнения (влияет на бюджет генерации и сложность).
- **donors** — референсы, откуда взят приём (id файла паспорта без `.md`: `pitch`, `linear`, `granola`, `structured-app` и т. д.), где именно и что берём как идею.

## Что нужно извлечь из каждого референса
1. **Все различимые блоки страницы** (hero, 5–10 следующих секций) как отдельные архетипы с ролью и композицией. Нельзя записывать целую страницу одним архетипом.
2. **Язык референса** — одна запись в `languages.json` (поля ниже), чтобы можно было выбирать визуальные языки отдельно от блоков.
3. **Подпись движения** — какой приём движения повторяется на странице (если есть).

Не копировать формы буквально: в `donors.note` писать идею и что нельзя повторять (палитра, шрифт, тексты).

## Запись языка (`part-<буква>.languages.json`)
```json
{
  "ref": "monologue",
  "mood": ["тихий", "редакционный", "тёмный"],
  "palette_family": "graphite-teal | warm-neutral | acid-contrast | pastel | monochrome | saturated-primary | earth | black-white",
  "type_class": "serif-editorial | grotesk-geometric | grotesk-neutral | mono-accent | display-expressive | humanist",
  "imagery_modes": ["ui-code", "photo-objects"],
  "density": "low | medium | high",
  "motion_signature": "автосцены по таймеру",
  "fits": ["B2B-saas"],
  "avoid": "что делает язык узнаваемым и нельзя повторять"
}
```

## Требования к результату
- Минимум **10 архетипов на референс**, если на странице столько различимых блоков; не выдумывай блоки, которых там нет.
- Опирайся на файлы: `references/<ref>.md` (паспорт), `references/shots/<ref>/` (скриншоты, `pages.json`, `code/summary.md`, `motion/`), посмотри 2–4 скриншота (Read на png) на референс. Не добавляй то, чего не видел.
- JSON валиден (проверь `JSON.parse`), UTF-8, русский язык в описаниях.
