# Premium Landing From Reference Visuals Before Layout Pipeline — лендинг по референсу: визуалы до вёрстки

Три этапа от понравившегося сайта и нашего текста до страницы с движением при прокрутке на десктопе и телефоне: сначала план, потом все визуалы с движением, потом вёрстка вокруг них. Вариант один. Сюжет страницы — как у референса: порядок и роль секций, способ донести мысль, показ продукта, приёмы прокрутки, фишка и кульминация. Вид — арт-дирекшн плана. Работает для любого продукта.

## Когда запускать

Только когда Иван прямо просит запустить этот пайплайн — лендинг по референсу с визуалами до вёрстки. Если просьба о лендинге по референсу и неясно, какой пайплайн нужен, — спроси Ивана, а не запускай этот.

## Входы запуска

- референс — ссылка на сайт, который нравится; если скрипт съёмки его не открыл — скриншоты или запись экрана;
- текст лендинга, разделённый на смысловые блоки;
- продукт, аудитория и подтверждённые факты о продукте;
- айдентика и ограничения бренда — либо «нет»;
- готовый дизайн приложения — либо «нет»;
- другие материалы продукта: фото, видео, логотип — либо «нет».

## Этапы

Каждый этап получает все части своего промпта, [правила для всех этапов](landing-pipeline-rules-for-all-stages.md), [правила визуалов и движения](landing-visuals-product-interface-and-scroll-motion-rules.md), входы запуска и результаты предыдущих этапов. Проверяющих нет: автор проходит самопроверку своего промпта и исправляет найденное.

1. **План** — разбор референса по секциям, наш текст по его сюжету, общий продуктовый пример, кульминация, один арт-дирекшн и список визуалов с тремя опорными. Результат — `stage-1/landing-plan.md`, HTML нет. Промпт: [01-break-down-reference-and-plan-landing.md](01-break-down-reference-and-plan-landing.md), [01-visual-list-attention-rhythm-and-hero.md](01-visual-list-attention-rhythm-and-hero.md), [01-art-direction-plan-format-and-self-check.md](01-art-direction-plan-format-and-self-check.md).
2. **Визуалы** — три опорных, язык визуалов, остальные визуалы параллельно; каждый сразу с движением. Результат — витрина визуалов `stage-2/visuals-showcase.html`. Промпт: [02-produce-visuals-with-motion.md](02-produce-visuals-with-motion.md), [02-visuals-showcase-checks-and-rework.md](02-visuals-showcase-checks-and-rework.md).
   **Остановка: Иван утверждает визуалы по витрине** — единственное решение человека внутри процесса. Если он прислал замечания, этап 2 запускается заново с ними и снова останавливается на витрине, пока Иван не утвердит.
3. **Вёрстка** — вся страница вокруг утверждённых визуалов на десктопе и телефоне, движение, проверки на пяти ширинах и прокруткой. Промпт: [03-lay-out-page-around-approved-visuals.md](03-lay-out-page-around-approved-visuals.md), [03-visual-placement-product-ui-and-design-system.md](03-visual-placement-product-ui-and-design-system.md), [03-scroll-motion-checks-and-result.md](03-scroll-motion-checks-and-result.md).

Визуалы этапы заказывают двум пайплайнам: [landing-image-generator](../landing-image-generator/README.md) — изображения слоями, [landing-video-generator](../landing-video-generator/README.md) — ролики под прокрутку.

## Папка запуска

`dev/pipeline-workspace/<ГГГГ-ММ-ДД>-<продукт>-visuals-before-layout-landing/` (вне Git):
- `inputs/` — входы запуска;
- `stage-1/` — `landing-plan.md`, кадры референса в `lab/reference/`;
- `stage-2/` — `visuals-showcase.html`, визуалы в `visuals/<визуал>/`, движок scroll-craft, листы кадров в `lab/`;
- `stage-3/` — страница, копия визуалов этапа 2 в `visuals/`, движок scroll-craft, листы кадров в `lab/`;
- `stage-notes.md` — заметки всех этапов, по разделу на этап.

## Съёмка референса

Скрипт открывает референс в Chrome на 1440 и 390 px, прокручивает колесом мыши по полэкрана, снимает кадр после каждого шага и сохраняет видимый текст страницы. Из корня проекта:

```bash
.venv/bin/python dev/pipelines/premium-landing-from-reference-visuals-before-layout-pipeline/tools/reference_site_scroll_frame_capturer.py \
  --url <ссылка на референс> --output-folder <папка запуска>/stage-1/lab/reference
```

Результат: `desktop/frame-NNN.png`, `phone/frame-NNN.png`, `reference-page-text.txt`. На проход — не больше 150 кадров; при упоре скрипт предупреждает, что страница снята не целиком. Если сайт не открылся — скрипт называет причину; тогда нужны скриншоты или запись экрана референса. Кадры лежат в `lab/` и на страницу запуска не выкладываются.

## Показ на странице запуска

После этапа 2 (и после каждой переделки по замечаниям) и после этапа 3 тот, кто ведёт запуск, выкладывает готовые этапы на страницу запуска и отправляет Ивану в подтверждённый личный Telegram одно сообщение: ссылку на страницу запуска и прямую ссылку этапа. После этапа 2 сообщение просит утвердить визуалы или прислать замечания. План на страницу запуска не выкладывается. Из корня проекта:

```bash
.venv/bin/python dev/pipelines/premium-landing-prototype-pipeline-version-5/tools/landing_run_page_publisher.py \
  --run-folder <папка запуска> --product-name "<название продукта>" --stage <2 или 3> --pipeline visuals-before-layout
```

Выкладываются этапы по указанный: папки `stage-N/` без `lab/`, `node_modules/`, заметок `*.md` и скрытых файлов, с оглавлением «Этап 2. Визуалы» и «Этап 3. Готовый лендинг». Страница запуска — одна постоянная ссылка `https://my.holdi.ai/prototypes/<продукт>-visuals-before-layout-landing-<код>/`, открывается без входа; адрес хранится в `published-run-page-address.txt` папки запуска. Если Telegram в сессии недоступен — ссылка даётся в ответе сессии с пометкой, что в Telegram она не ушла. Если выкладка не удалась — причина сообщается Ивану; файлы или показ в чате её не заменяют.

## Проверка прокруткой

Съёмщик скилла scroll-craft проходит страницу по точкам прокрутки, снимает кадры и лист кадров `sheet.png`, пишет `report.json` с мёртвой прокруткой, недопроявленными подсказками и контрастом. Один раз в папке запуска: `npm i playwright-core`. Затем из папки запуска:

```bash
SC=/home/ivan/claude-sandbox/hypothesis-tester/.claude/skills/scroll-craft
node "$SC/scripts/serve.mjs" --root <папка этапа> --port 4500 &
node "$SC/scripts/shoot.mjs" --url http://localhost:4500/<страница>.html --out <папка этапа>/lab/desktop
node "$SC/scripts/shoot.mjs" --url http://localhost:4500/<страница>.html --out <папка этапа>/lab/phone --width 390 --height 844
node "$SC/scripts/shoot.mjs" --url http://localhost:4500/<страница>.html --out <папка этапа>/lab/reduced --reduced-motion
```

Прочитай `sheet.png` каждого прогона: съёмщик доказывает, что кадры меняются, но не что композиция хороша. Реальный телефон он не проверяет.

## Рядом

- [Журнал версий](../../docs/changelog/2026-10-01_premium-landing-from-reference-visuals-before-layout-pipeline-version-history.md) — история версий; агенты при работе его не читают.
