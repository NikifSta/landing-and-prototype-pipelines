"""Shoot a reference site scroll step by scroll step on desktop and phone screens and save its visible text.

Stage 1 of the landing-from-reference pipeline reads these frames to break the reference down section by section
(pipeline README, «Съёмка референса»). The scroll-craft shooter cannot do it: it samples only its own engine's acts.
Run from the project root:

    .venv/bin/python dev/pipelines/premium-landing-from-reference-visuals-before-layout-pipeline/tools/reference_site_scroll_frame_capturer.py \\
      --url https://example.com --output-folder <run folder>/stage-1/lab/reference
"""
from __future__ import annotations

import argparse
import importlib.metadata
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

try:
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_IMPORT_ERROR: ImportError | None = None
except ImportError as import_error:  # main() explains the environment instead of a bare traceback
    PLAYWRIGHT_IMPORT_ERROR = import_error

if TYPE_CHECKING:
    from playwright.sync_api import Browser, Page, Playwright


@dataclass(frozen=True)
class ViewportPass:
    """One shooting pass: the folder of its frames and the screen it emulates."""
    folder_name: str
    width: int
    height: int
    device_scale_factor: int
    is_phone: bool


# Sizes of the pipeline's snapshot checks («Правила для всех этапов», «Проверка снимками»); the phone is shot at
# double density so its small type stays readable on the frame.
VIEWPORT_PASSES = (
    ViewportPass("desktop", 1440, 900, 1, False),
    ViewportPass("phone", 390, 844, 2, True),
)
# Many sites choose their phone layout by browser identity, not by width alone.
PHONE_USER_AGENT = ("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/130.0.0.0 Mobile Safari/537.36")
# Half a screen per step keeps every scroll state on at least one frame.
SCROLL_STEP_SHARE_OF_SCREEN = 0.5
# Scroll-linked animations and smooth-scroll libraries settle within this time after a wheel step.
PAUSE_AFTER_SCROLL_MS = 700
# About 75 screens at half-screen steps; a longer page is cut with a warning.
MAX_FRAMES_PER_PASS = 150
# One stalled step can be lazy loading; this many stalled steps in a row at the page bottom mean its end.
STALLED_STEPS_BEFORE_END = 2
# Above the bottom a stalled window means an inner scroller under the cursor (a mockup's feed) takes the wheel
# until its own end; 30 half-screen steps cover 15 screens of it. Longer stalls are scroll-jacking: stop there.
STALLED_STEPS_BEFORE_GIVING_UP_ABOVE_BOTTOM = 30
# Rounded scroll positions may miss the exact bottom by a pixel or two.
PAGE_BOTTOM_TOLERANCE_PX = 2
PAGE_OPEN_TIMEOUT_MS = 60_000
# Pages that keep polling the network never go idle; waiting stops after this time and shooting goes on.
NETWORK_IDLE_WAIT_MS = 10_000
FIRST_FAILED_HTTP_STATUS = 400
ALLOWED_URL_SCHEMES = frozenset({"http", "https"})
FRAME_FILE_PREFIX = "frame-"
FRAME_FILE_SUFFIX = ".png"
# Three digits keep frame names in shooting order up to MAX_FRAMES_PER_PASS.
FRAME_NUMBER_DIGITS = 3
PAGE_TEXT_FILE_NAME = "reference-page-text.txt"
# Installed Chrome plays the h264 videos of reference sites; Playwright's bundled Chromium may not.
# Same places as the scroll-craft shooter looks in (.claude/skills/scroll-craft/scripts/shoot.mjs).
INSTALLED_CHROME_PATHS = (
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)
NEED_SCREENSHOTS_HINT = ("Нужны скриншоты или запись экрана референса "
                         "(README пайплайна, раздел «Съёмка референса»).")
EXIT_CODE_SUCCESS = 0
EXIT_CODE_SHOOTING_FAILED = 1
EXIT_CODE_BAD_ARGUMENTS = 2


class ReferencePageOpenError(RuntimeError):
    """The reference page did not open: no response or an HTTP error status."""


def validate_reference_url(url: str) -> str:
    """Return the reference address when it is an http(s) address with a host, otherwise raise ValueError."""
    parsed_url = urlparse(url)
    if parsed_url.scheme not in ALLOWED_URL_SCHEMES or not parsed_url.netloc:
        raise ValueError(f"Адрес референса должен начинаться с http:// или https:// и содержать сайт: {url!r}")
    return url


def frame_file_name(number: int) -> str:
    """Return the file name of the frame with the given 1-based number."""
    return f"{FRAME_FILE_PREFIX}{number:0{FRAME_NUMBER_DIGITS}d}{FRAME_FILE_SUFFIX}"


def saved_frames(frames_folder: Path) -> list[Path]:
    """Return the frames saved in the folder in shooting order."""
    return sorted(frames_folder.glob(f"{FRAME_FILE_PREFIX}*{FRAME_FILE_SUFFIX}"))


def _last_steps_stalled(scroll_positions: list[int], stalled_steps: int) -> bool:
    """Tell whether the last stalled_steps wheel steps left the scroll position unchanged."""
    last_positions = scroll_positions[-(stalled_steps + 1):]
    return len(last_positions) == stalled_steps + 1 and len(set(last_positions)) == 1


def scroll_reached_end(scroll_positions: list[int], at_page_bottom: bool) -> bool:
    """Tell whether shooting should stop: stalled at the page bottom, or stalled above it for too long."""
    if at_page_bottom:
        return _last_steps_stalled(scroll_positions, STALLED_STEPS_BEFORE_END)
    return _last_steps_stalled(scroll_positions, STALLED_STEPS_BEFORE_GIVING_UP_ABOVE_BOTTOM)


def _installed_chrome_path() -> str | None:
    """Return the first existing browser of INSTALLED_CHROME_PATHS, or None when there is none."""
    return next((chrome_path for chrome_path in INSTALLED_CHROME_PATHS if Path(chrome_path).exists()), None)


def _launch_browser(playwright: Playwright) -> Browser:
    """Launch installed Chrome, or Playwright's Chromium with a warning when no Chrome is installed."""
    chrome_path = _installed_chrome_path()
    if chrome_path is None:
        print("Установленный Chrome не найден; снимаю во встроенном Chromium Playwright — "
              "ролики h264 на кадрах могут не показаться.", file=sys.stderr, flush=True)
        return playwright.chromium.launch(headless=True)
    return playwright.chromium.launch(executable_path=chrome_path, headless=True)


def _wait_for_network_idle(page: Page) -> None:
    """Wait until the page stops loading, but not longer than NETWORK_IDLE_WAIT_MS."""
    try:
        page.wait_for_load_state("networkidle", timeout=NETWORK_IDLE_WAIT_MS)
    except PlaywrightTimeoutError:
        pass  # the page keeps polling the network; it has loaded enough to shoot


def _open_reference_page(browser: Browser, viewport_pass: ViewportPass, url: str) -> Page:
    """Open the reference on the pass's screen; raise ReferencePageOpenError when it does not open."""
    context = browser.new_context(
        viewport={"width": viewport_pass.width, "height": viewport_pass.height},
        device_scale_factor=viewport_pass.device_scale_factor, is_mobile=viewport_pass.is_phone,
        has_touch=viewport_pass.is_phone, user_agent=PHONE_USER_AGENT if viewport_pass.is_phone else None)
    page = context.new_page()
    response = page.goto(url, wait_until="load", timeout=PAGE_OPEN_TIMEOUT_MS)
    if response is None or response.status >= FIRST_FAILED_HTTP_STATUS:
        status = "нет ответа" if response is None else f"ответ {response.status}"
        raise ReferencePageOpenError(f"Референс {url} не открылся: {status}.")
    _wait_for_network_idle(page)
    # The wheel scrolls what is under the cursor: put it in the middle of the page, not on its corner.
    page.mouse.move(viewport_pass.width / 2, viewport_pass.height / 2)
    return page


def _scroll_position(page: Page) -> int:
    """Return the current vertical scroll position of the page in CSS pixels."""
    return round(page.evaluate("window.scrollY"))


def _page_bottom_reached(page: Page) -> bool:
    """Tell whether the bottom edge of the screen has reached the bottom of the page."""
    return page.evaluate(
        "tolerance => scrollY + innerHeight >= document.documentElement.scrollHeight - tolerance",
        PAGE_BOTTOM_TOLERANCE_PX)


def _clear_old_frames(frames_folder: Path) -> None:
    """Delete frames of an earlier run so a shorter page leaves no stale frames behind."""
    for old_frame in saved_frames(frames_folder):
        old_frame.unlink()


def _shoot_scroll_frames(page: Page, frames_folder: Path, scroll_step_px: int) -> None:
    """Save a frame at the top and after every wheel step that moved the page, until its end or the frame cap."""
    scroll_positions = [_scroll_position(page)]
    frames_saved = 1
    page.screenshot(path=frames_folder / frame_file_name(frames_saved))
    while frames_saved < MAX_FRAMES_PER_PASS:
        page.mouse.wheel(0, scroll_step_px)
        page.wait_for_timeout(PAUSE_AFTER_SCROLL_MS)
        scroll_positions.append(_scroll_position(page))
        if scroll_reached_end(scroll_positions, _page_bottom_reached(page)):
            _warn_when_stopped_above_bottom(page, frames_folder)
            return
        if scroll_positions[-1] != scroll_positions[-2]:
            frames_saved += 1
            page.screenshot(path=frames_folder / frame_file_name(frames_saved))
    print(f"{frames_folder.name}: упор в {MAX_FRAMES_PER_PASS} кадров, страница снята не целиком.",
          file=sys.stderr, flush=True)


def _warn_when_stopped_above_bottom(page: Page, frames_folder: Path) -> None:
    """Warn that shooting stopped above the page bottom: the site moves its content without scrolling the window."""
    if not _page_bottom_reached(page):
        print(f"{frames_folder.name}: страница перестала прокручиваться выше конца — сайт двигает содержимое "
              f"без прокрутки окна; проверь кадры. {NEED_SCREENSHOTS_HINT}", file=sys.stderr, flush=True)


def _save_page_text(page: Page, output_folder: Path) -> None:
    """Save the visible text of the scrolled-through page: lazy sections have loaded by then."""
    (output_folder / PAGE_TEXT_FILE_NAME).write_text(page.inner_text("body"), encoding="utf-8")


def _shoot_viewport_pass(browser: Browser, viewport_pass: ViewportPass, url: str, output_folder: Path) -> None:
    """Shoot one screen of the reference; the desktop pass also saves the page text."""
    frames_folder = output_folder / viewport_pass.folder_name
    frames_folder.mkdir(parents=True, exist_ok=True)
    _clear_old_frames(frames_folder)
    page = _open_reference_page(browser, viewport_pass, url)
    scroll_step_px = round(viewport_pass.height * SCROLL_STEP_SHARE_OF_SCREEN)
    _shoot_scroll_frames(page, frames_folder, scroll_step_px)
    if not viewport_pass.is_phone:
        _save_page_text(page, output_folder)
    page.context.close()


def shoot_reference(url: str, output_folder: Path) -> None:
    """Shoot the reference on every screen of VIEWPORT_PASSES and save its visible text next to the frames."""
    with sync_playwright() as playwright:
        browser = _launch_browser(playwright)
        for viewport_pass in VIEWPORT_PASSES:
            _shoot_viewport_pass(browser, viewport_pass, url, output_folder)
        browser.close()


def _explain_missing_playwright(error: ImportError) -> None:
    """Print why Playwright did not import: interpreter, PATH, installed version and likely causes."""
    try:
        installed_version = importlib.metadata.version("playwright")
    except importlib.metadata.PackageNotFoundError:
        installed_version = "не установлен"
    print(f"Playwright не импортируется: {error}\nPython: {sys.executable}\nPATH: {os.environ.get('PATH', '')}\n"
          f"Playwright: {installed_version}\nВероятно, скрипт запущен не через .venv/bin/python из корня проекта "
          "или пакет не установлен: .venv/bin/pip install -r requirements.txt", file=sys.stderr)


def _print_summary(output_folder: Path) -> None:
    """Print the frame count of every pass and warn about a pass whose page did not scroll."""
    for viewport_pass in VIEWPORT_PASSES:
        frame_count = len(saved_frames(output_folder / viewport_pass.folder_name))
        print(f"{viewport_pass.folder_name}: {frame_count} кадров", flush=True)
        if frame_count == 1:
            print(f"{viewport_pass.folder_name}: страница не прокрутилась — она короче экрана или сайт прокручивает "
                  f"не окно; проверь кадр. {NEED_SCREENSHOTS_HINT}", file=sys.stderr, flush=True)
    print(f"Текст страницы: {output_folder / PAGE_TEXT_FILE_NAME}", flush=True)


def _parse_arguments() -> argparse.Namespace:
    """Read --url and --output-folder from the command line."""
    parser = argparse.ArgumentParser(description="Снять сайт-референс по кадрам прокрутки на десктопе и телефоне.")
    parser.add_argument("--url", required=True, help="адрес референса, http:// или https://")
    parser.add_argument("--output-folder", required=True,
                        help="папка кадров, обычно <папка запуска>/stage-1/lab/reference")
    return parser.parse_args()


def main() -> int:
    """Check Playwright, validate the arguments, shoot the reference and print a summary; return the exit code."""
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    if PLAYWRIGHT_IMPORT_ERROR is not None:
        _explain_missing_playwright(PLAYWRIGHT_IMPORT_ERROR)
        return EXIT_CODE_SHOOTING_FAILED
    arguments = _parse_arguments()
    output_folder = Path(arguments.output_folder)
    try:
        shoot_reference(validate_reference_url(arguments.url), output_folder)
    except ValueError as error:
        print(error, file=sys.stderr)
        return EXIT_CODE_BAD_ARGUMENTS
    except (ReferencePageOpenError, PlaywrightError) as error:
        print(f"{error}\n{NEED_SCREENSHOTS_HINT}", file=sys.stderr)
        return EXIT_CODE_SHOOTING_FAILED
    _print_summary(output_folder)
    return EXIT_CODE_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
