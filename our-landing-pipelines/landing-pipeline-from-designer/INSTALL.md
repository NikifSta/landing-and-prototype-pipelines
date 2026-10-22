# Установка в hypothesis-tester

Плагин `landing` лежит в `dev/pipelines/landing-pipeline-from-designer/` проекта hypothesis-tester и подключён в настройках проекта (`.claude/settings.json`), поэтому команды `/landing:run`, `/landing:intake` и остальные есть в любой сессии Claude Code этого проекта, в том числе в Telegram-боте.

## Один раз на машине

1. Зависимости скриптов и браузер Chromium для скриншотов — из папки плагина: `npm run setup`.
2. Настройки генерации: `cp .env.example .env` в папке плагина. Ключей там нет.
3. Изображения рисует Astra через Codex: `codex login status` должен отвечать «Logged in using ChatGPT»; иначе `codex login`.
4. Видео делает Seedance 2.5 в Dreamina через Chrome навигатора (скилл `real-chrome-web-navigator`) со входом в Dreamina; Python-окружение проекта — `.venv` с playwright и Pillow.
5. Выкладка на страницу запуска my.holdi.ai идёт через `rsync` по SSH-ключу общего модуля публикации (`dev/pipelines/pipeline-run-page-publishing/`).

## Подключение плагина (уже сделано)

    claude plugin marketplace add ./dev/pipelines/landing-pipeline-from-designer --scope project
    claude plugin install landing@landing-pipeline-from-designer --scope project

Если подключение в настройках не работает — запуск из корня проекта: `claude --plugin-dir dev/pipelines/landing-pipeline-from-designer`.

## Запуск

Рабочая папка проектов — `dev/pipeline-workspace/landing-pipeline-from-designer-workspace/` (вне Git). В сессии проекта: `/landing:run <гипотеза>`, `/landing:run --ask` или `/landing:run --auto <гипотеза>`. Порядок работы и правки — [GUIDE.md](GUIDE.md).

## Если что-то не получилось
- `node` или `npm` не найдены — установите Node.js 20+.
- `Executable doesn't exist` (Chromium) — `npx playwright install chromium` в папке плагина.
- `/landing:run` не найдена — `claude plugin list` должен показывать `landing@landing-pipeline-from-designer`; иначе повторите подключение.
- Картинки не создаются — `codex login status` и `MEDIA_IMAGE_GENERATOR` в `.env` плагина.
- Видео не создаётся — Chrome навигатора со входом в Dreamina и кредиты на балансе.
