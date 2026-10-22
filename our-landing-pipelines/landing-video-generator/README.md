# Landing Video Generator

Делает ролики «видео под прокруткой» для визуальных зон лендинга по заказу этапов 2–4 [пайплайна лендинга](../premium-landing-prototype-pipeline-version-5/README.md). Первый кадр — [пайплайн изображений](../landing-image-generator/README.md) (Astra через Codex), ролик — Seedance 2.5 на сайте Dreamina, перекодировка под прокрутку — `encode.sh` скилла scroll-craft.

## Как вызывать

Одна зона — один агент с промптом [generate-landing-video.md](generate-landing-video.md). На странице не больше двух роликов — правила для всех этапов, раздел «Движение при прокрутке». Ролики рендерятся строго по одному: у всех рендеров один Chrome и одна вкладка Dreamina, поэтому скрипт, запущенный во время чужого рендера, ждёт его окончания.

## Что нужно на машине

- Chrome со входом в Dreamina — сессия скилла `real-chrome-web-navigator`;
- `.venv` проекта с playwright и Pillow;
- полный ffmpeg и ffprobe;
- кредиты Dreamina: около 91 за секунду на 1080P — разрешении по умолчанию; ролик 5 секунд в двух форматах — около 910;
- платный план Dreamina: на бесплатном Seedance 2.5 недоступна, и скрипт останавливается до оплаты. После покупки или продления плана перезагрузите вкладку Dreamina в Chrome навигатора: до перезагрузки страница показывает прежний значок «Upgrade», и скрипт остановится так же (замечено 19-10-2026).

## Результат

В папке результата: `<зона>-16x9.mp4` и `<зона>-9x16.mp4` — ролики под прокрутку без звука; `<зона>-16x9-poster.jpg` и `<зона>-9x16-poster.jpg` — обложки из первых кадров; `<зона>-start-*` — первые кадры и их промпты; `*-motion-prompt.txt` — движение камеры; `*-raw.mp4` и `*-dreamina-status.json` — исходники Dreamina; `*-sheet.jpg` — листы кадров.

## Инструменты

- `tools/landing_scroll_clip_dreamina_renderer.py` — один ролик: кадр, промпт, формат 16:9 или 9:16, длительность; разрешение по умолчанию — наивысшее из предложенных.
- Модули `tools/dreamina_*` и `tools/keyframe_to_model_frame_fitter.py` перенесены из проекта video-generation (`.claude/skills/character-scene-video-generator/scripts/`), кроме новых `dreamina_render_settings.py`, `dreamina_start_frame_slot_uploader.py`, `dreamina_credit_balance_badge_reader.py`, `dreamina_prompt_textarea_writer.py`, `dreamina_submit_button_clicker.py` и `dreamina_paid_plan_requirement_checker.py`; что изменено — в журнале версий.
- `tools/landing_video_renderer_llm_repair_loop.py` и [landing-video-renderer-repair-agent-prompt.md](landing-video-renderer-repair-agent-prompt.md) — самопочинка скрипта.
- Тесты — `dev/tests/landing_video_generator/`, запуск: `.venv/bin/python -m unittest discover -s dev/tests/landing_video_generator`.

## Скопированные модули

`dreamina_web_ui_composer_browser_mechanics.py`, `dreamina_web_ui_finished_clip_watcher.py` и `dreamina_reference_panel_attached_file_count_reader.py` — побайтовые копии из video-generation, их не правят. Если Dreamina изменила то, с чем они работают, адаптация — отдельным модулем, который драйвер вызывает вместо них, как `dreamina_credit_balance_badge_reader.py`, `dreamina_prompt_textarea_writer.py` и `dreamina_submit_button_clicker.py`.

## Самопочинка скрипта

Если рендер падает не на штатной остановке — нет сессии Chrome, кредитов, платного плана или замеренной цены разрешения, Dreamina отклонила запрос или уронила рендер, — скрипт зовёт ЛЛМ-ремонтника: `claude -p`, Opus 5.5, бюджет `BUDGET_NORMAL`, промпт [landing-video-renderer-repair-agent-prompt.md](landing-video-renderer-repair-agent-prompt.md). Ремонтник смотрит живую страницу, чинит скрипт, проверяет прогоном без оплаты и коммитит.

- Сбой до нажатия кнопки запуска — после починки скрипт сам повторяет рендер.
- Сбой после нажатия (в файле статуса `state: submitted`) — рендер не повторяется, чтобы не заплатить дважды; скрипт сообщает о правке.
- Не больше двух починок на запуск; починки идут по одной; лог ремонтника — `<ролик>-repair-attempt-<N>-log.txt` рядом с роликом.
- Починка занимает минуты, иногда до 45: вызов скрипта в это время ждёт.

`--stop-before-submit` — прогон без оплаты: всё до кнопки запуска, включая проверку чтением, что кнопку ничто не перекрывает; кнопка не нажимается, файл статуса не пишется.

## Документы

- [Журнал версий](../../docs/changelog/2026-09-27_premium-landing-prototype-pipeline-version-history.md) — история, общая с пайплайном лендинга; агенты при работе его не читают.
