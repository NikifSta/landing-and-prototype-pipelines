# Починка скрипта рендера ролика лендинга

Скрипт `dev/pipelines/landing-video-generator/tools/landing_scroll_clip_dreamina_renderer.py` рендерит ролик на сайте Dreamina через браузер и упал — скорее всего, сайт изменил разметку. Найди причину, исправь скрипт, проверь исправление прогоном без оплаты и закоммить. Данные сбоя — в разделе «Этот сбой» в конце.

Рабочая папка — корень проекта. Python — только `.venv/bin/python`.

## Прочитай сначала

- `dev/pipelines/landing-video-generator/README.md` — устройство пайплайна, разделы «Скопированные модули» и «Самопочинка скрипта».
- Файлы и строки из трассировки ошибки.
- `git log --oneline -10 -- dev/pipelines/landing-video-generator/` — если сбой уже исправлен другим запуском, только проверь прогоном без оплаты и ответь.

## Живая страница — только чтение

Chrome со входом в Dreamina уже запущен (скилл `real-chrome-web-navigator`). Подключение из скрипта на `.venv/bin/python`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path.home() / ".claude/skills/real-chrome-web-navigator/scripts"))
from browser_environment_config import build_browser_environment_config
from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.connect_over_cdp(f"http://localhost:{build_browser_environment_config().debug_port}")
    page = browser.contexts[0].pages[0]
    print(page.evaluate("() => document.querySelectorAll('textarea').length"))  # читать DOM
    browser.close()  # только отключается, Chrome остаётся
```

Страница композера видео — `https://dreamina.capcut.com/ai-tool/generate/?type=video`; после перезагрузки она открывается в режиме «Omni reference», рендерер переключает её в «First and last frames». Читай разметку через `page.evaluate`; переключать настройки композера (модель, режим, формат, длительность) можно — это бесплатно.

## Запрещено

- Нажимать кнопку запуска генерации (круглая стрелка справа в панели настроек) и подтверждать отправку.
- Запускать рендерер без `--stop-before-submit`.
- Ослаблять защиты, чтобы прогон прошёл: проверку кредитов, сверку текста промпта, блокировку «один рендер за раз», список штатных остановок в `tools/landing_video_renderer_llm_repair_loop.py`.
- Править скопированные модули — правило в README, раздел «Скопированные модули».

## Как чинить

1. Найди на живой странице, чего скрипт не нашёл или что изменилось. Причину называй по наблюдению, не по догадке.
2. Исправь минимально и в стиле окружающего кода: значение — именованная константа с комментарием, откуда оно и когда замерено.
3. Добавь тест `unittest` в `dev/tests/landing_video_generator/` на исправленное поведение, без сети и Chrome. Файл тестов длиннее 300 строк не раздувай — заведи новый.
4. Прогони все тесты: `.venv/bin/python -m unittest discover -s dev/tests/landing_video_generator`.
5. Выполни команду «Проверка без оплаты» из раздела «Этот сбой». Успех — строка `stopped before submit — nothing was charged`. Если прогон упал дальше по пути — чини и это.
6. Закоммить только свои файлы: `git add <пути>` (не `-A` и не `.`), сообщение `fix: landing video renderer — <что изменилось на сайте и что поправлено>`. Если после правки коммитить нечего, не коммить.

Если рендер уже отправлен, всё равно чини и проверяй прогоном без оплаты; сам рендер не повторяй.

## Ответ

Первая строка — ровно `FIXED` (прогон без оплаты дошёл до `stopped before submit`) или `NOT_FIXED`. Дальше 1–3 предложения: что изменилось на сайте, что поправлено, коммит; для `NOT_FIXED` — что мешает.
