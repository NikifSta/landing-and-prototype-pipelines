# Пайплайны лендингов и прототипирования — снимок от 19-10-2026

Наши пайплайны из проекта `hypothesis-tester` (`dev/pipelines/`) и сторонние опенсорсные скиллы лендингов, которые сравнивались на лендингах Холди и Тинкли. Файлы наших пайплайнов взяты из Git (коммит `eb234c1`), без `node_modules`, кэшей и локальных снимков.

## our-landing-pipelines — наши пайплайны лендингов

- **landing-pipeline-from-designer** — действующий: плагин Claude Code `landing`, 11 этапов от опроса до публикации, каталог 280+ блоков-референсов. Начинать с `README.md`, установка — `INSTALL.md`, работа — `GUIDE.md`. После распаковки — `npm run setup`.
- **premium-landing-prototype-pipeline-version-5** — промпты: поиск образцов уровня и четыре этапа до страницы с движением при прокрутке.
- **premium-landing-from-reference-in-new-style-pipeline** — лендинг по понравившемуся сайту в новом стиле (на основе версии 5).
- **premium-landing-from-reference-visuals-before-layout-pipeline** — лендинг по референсу: сначала все визуалы с движением, потом вёрстка.
- **premium-landing-prototype-pipeline** — версия 4, набор промптов от текста до сборки страницы.
- **landing-image-generator** и **landing-video-generator** — вспомогательные: изображения (Astra через Codex) и ролики под прокрутку (Seedance 2.5 в Dreamina) для зон лендинга.

## our-app-prototype-pipelines — наш пайплайн прототипирования приложений

- **premium-app-prototype-pipeline-version-2** — действующий: экраны приложения в коде для показа на лендинге. Начинать с `README.md` и `PIPELINE.md`.
- **premium-app-prototype-pipeline-version-3-design-quality-experiment** — экспериментальная копия версии 2 с планкой и критикой дизайнерского уровня.
- **premium-app-prototype-pipeline** — версия 1.14, заморожена 29-09-2026, для истории.

## imported-holdi-prototyping-sources — исходные промпты из передачи Холди

Неизменённые инструкции, импортированные 23-09-2026: «Тестирование гипотез» (промпты лендингов), «App Prototype Factory — 2026-09-21», «AI Product Interface Pipeline». Происхождение файлов — `IMPORT_MANIFEST.json`.

## open-source-landing-skills — сторонние скиллы (версии с GitHub от 18-10-2026)

Источники и коммиты — `SOURCES.md`; проверка изменений на вредоносный код — `SECURITY_REVIEW.md`. Файл лицензии лежит только у avoid-ai-design, awesome-design-md-ecommerce, frontend-design, scroll-craft, ui-ux-pro-max-plugin и web-design; у остальных условия смотреть в их репозиториях по `SOURCES.md`.

- **awwwards**, **build-awwwards-quality-sites**, **gsap** — сайты уровня Awwwards и анимация GSAP.
- **landing-page**, **landing-page-design**, **design-review** — сборка и разбор лендингов.
- **frontend-design** (Anthropic), **distinctive-frontend**, **avoid-ai-design**, **web-design** — неформульный дизайн интерфейсов.
- **impeccable-plugin**, **ui-ux-pro-max-plugin** — плагины дизайна интерфейсов.
- **awesome-design-md**, **awesome-design-md-ecommerce** — коллекции DESIGN.md (описаний дизайн-систем) известных сайтов.
- **scroll-craft** (Nate Herk, MIT) — лендинги с движением при прокрутке; генерация изображений через kie.ai.

В сравнении участвовал ещё Magic MCP (21st.dev) — это сервер, а не файлы, поэтому в архиве его нет.

Скриншоты-доказательства коллекции awesome-design-md-ecommerce (папки `design-md/<сайт>/evidence/`, 105 PNG, 41 МБ) вынесены в отдельный архив `awesome-design-md-ecommerce-evidence-screenshots-2026-10-19.zip`: с ними основной архив не проходит лимит Telegram в 50 МБ, а инструкции скилла на них не ссылаются.
