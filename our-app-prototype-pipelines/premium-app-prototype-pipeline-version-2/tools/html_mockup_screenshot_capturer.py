"""Capture a standalone HTML mockup or a page address as a whole page and report overflow and inner scroll areas.

By default the screenshot covers the whole page height; the browser window height only positions pinned zones.
A page taller than the image height limit is captured whole at a lower device scale, reported as scaleReduced.
--window-at-scroll-y captures only the browser window scrolled to that offset, at the requested scale,
for the detail check next to a reference (contracts-reviews-and-result-versions.md, «Проверка деталей»).

Run through the bounded runner, because it starts Chrome:
  /home/ivan/.local/bin/run-bounded-check --tasks 128 --memory-mib 1024 --timeout 300 -- \
    /home/ivan/claude-sandbox/hypothesis-tester/.venv/bin/python html_mockup_screenshot_capturer.py \
    --html key-screen.html --output-png key-screen.png
A screen of the demo app is captured by address instead of a file, for example
  --url "http://127.0.0.1:4173/#/frames/FRAME-03" or --url "file:///…/demo.html#/frames/FRAME-03".
"""
import argparse
import json
import math
import sys
from pathlib import Path

# Ширина окна по contracts-demo-data-behavior-format-and-quality.md, «Формат и размер»: 1440 CSS px, масштаб 100 %; высота страницы — по содержимому.
DEFAULT_VIEWPORT_WIDTH_PX = 1440
# Высота окна браузера техническая: по ней считаются закреплённые зоны, снимок всё равно — вся страница.
DEFAULT_WINDOW_HEIGHT_PX = 900
# Все снимки пайплайна снимаются с коэффициентом 2 (contracts-demo-data-behavior-format-and-quality.md, «Формат и размер»), если страница помещается.
DEFAULT_DEVICE_SCALE_FACTOR = 2
# Предел высоты изображения: 27.09.2026 в run-bounded-check с 1024 MiB страница 9000 CSS px при коэффициенте 2
# (18 000 px) снялась, а 12 000 CSS px — процесс убит по памяти.
MAX_SCREENSHOT_DEVICE_HEIGHT_PX = 18_000
# Сниженный коэффициент округляется вниз до сотых, чтобы высота изображения не превысила предел.
SCALE_ROUNDING_STEPS_PER_UNIT = 100
# Запас на загрузку локальных шрифтов и картинок одной страницы.
PAGE_LOAD_TIMEOUT_MS = 60_000
# Расхождение меньше пикселя — округление вёрстки, а не обрезка.
CLIPPING_TOLERANCE_PX = 1
EXIT_INPUT_ERROR = 2
# Адреса, которые открывает браузер: сервер сборки демо или самодостаточный HTML с диска.
SUPPORTED_ADDRESS_PREFIXES = ("http://", "https://", "file://")

# Ищет элементы, чьё содержимое не помещается и скрыто без прокрутки и без многоточия.
HIDDEN_OVERFLOW_PROBE_SCRIPT = """(tolerance) => {
  const clipped = [];
  for (const element of document.querySelectorAll('body *')) {
    const style = getComputedStyle(element);
    const hidesX = ['hidden', 'clip'].includes(style.overflowX) && style.textOverflow !== 'ellipsis';
    const hidesY = ['hidden', 'clip'].includes(style.overflowY);
    const overflowX = element.scrollWidth - element.clientWidth > tolerance;
    const overflowY = element.scrollHeight - element.clientHeight > tolerance;
    if ((hidesX && overflowX) || (hidesY && overflowY)) {
      clipped.push({tag: element.tagName.toLowerCase(), id: element.id, className: String(element.className).slice(0, 80),
                    text: (element.innerText || '').slice(0, 80)});
    }
  }
  return {pageScrollWidth: document.documentElement.scrollWidth, clipped};
}"""

# Ищет блоки с собственной вертикальной прокруткой: их содержимое длиннее блока и не видно на снимке страницы.
INNER_SCROLL_PROBE_SCRIPT = """(tolerance) => {
  const areas = [];
  for (const element of document.querySelectorAll('body *')) {
    const scrollsVertically = ['auto', 'scroll'].includes(getComputedStyle(element).overflowY);
    if (scrollsVertically && element.scrollHeight - element.clientHeight > tolerance) {
      areas.push({tag: element.tagName.toLowerCase(), id: element.id, className: String(element.className).slice(0, 80),
                  text: (element.innerText || '').slice(0, 80), clientHeight: element.clientHeight,
                  scrollHeight: element.scrollHeight});
    }
  }
  return areas;
}"""

# Полная высота страницы в CSS px — по ней выбирается коэффициент снимка.
PAGE_HEIGHT_PROBE_SCRIPT = "() => Math.ceil(document.documentElement.scrollHeight)"


def import_playwright():
    """Import Playwright or explain which Python environment is broken."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        print(f"Missing Playwright: {error}\npython={sys.executable}\n"
              "Run with /home/ivan/claude-sandbox/hypothesis-tester/.venv/bin/python", file=sys.stderr)
        raise SystemExit(EXIT_INPUT_ERROR)
    return sync_playwright


def parse_arguments() -> argparse.Namespace:
    """Read CLI options for one mockup capture."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    page_source = parser.add_mutually_exclusive_group(required=True)
    page_source.add_argument("--html", type=Path, help="standalone HTML mockup")
    page_source.add_argument("--url", help="page address, e.g. a frame route of the demo app")
    parser.add_argument("--output-png", required=True, type=Path, help="screenshot to write")
    parser.add_argument("--width", type=int, default=DEFAULT_VIEWPORT_WIDTH_PX)
    parser.add_argument("--height", type=int, default=DEFAULT_WINDOW_HEIGHT_PX,
                        help="browser window height for pinned zones; the screenshot always covers the whole page")
    parser.add_argument("--scale", type=float, default=DEFAULT_DEVICE_SCALE_FACTOR)
    parser.add_argument("--window-at-scroll-y", type=int,
                        help="capture only the browser window scrolled to this CSS px offset, 0 for the page top")
    return parser.parse_args()


def validate_window_scroll_offset(window_scroll_offset_px: int | None) -> None:
    """Reject a negative window offset; no offset means a whole-page capture."""
    if window_scroll_offset_px is not None and window_scroll_offset_px < 0:
        raise ValueError(f"--window-at-scroll-y must be zero or positive, got {window_scroll_offset_px}")


def resolve_page_address(html_path: Path | None, page_url: str | None) -> str:
    """Return the address to open: a file URI of an existing mockup or a supported page address."""
    if html_path is not None:
        if not html_path.is_file():
            raise ValueError(f"HTML file not found: {html_path}")
        return html_path.resolve().as_uri()
    if not page_url.startswith(SUPPORTED_ADDRESS_PREFIXES):
        raise ValueError(f"Page address must start with http://, https:// or file://: {page_url}")
    return page_url


def choose_device_scale_factor(page_height_css_px: int, requested_scale: float,
                               max_device_height_px: int = MAX_SCREENSHOT_DEVICE_HEIGHT_PX) -> float:
    """Return the requested scale, or the largest scale that keeps the whole page within the image height limit."""
    if page_height_css_px <= 0:
        raise ValueError(f"Page height must be positive, got {page_height_css_px}")
    if page_height_css_px * requested_scale <= max_device_height_px:
        return requested_scale
    fitting_scale = max_device_height_px / page_height_css_px
    return math.floor(fitting_scale * SCALE_ROUNDING_STEPS_PER_UNIT) / SCALE_ROUNDING_STEPS_PER_UNIT


def open_page(browser, page_address: str, arguments: argparse.Namespace, scale: float):
    """Open the page in a window of the requested size at the given device scale and wait for its fonts."""
    # Статичный снимок не должен ловить пульсацию в бледной фазе — снимаем с уменьшенным движением.
    page = browser.new_page(viewport={"width": arguments.width, "height": arguments.height},
                            device_scale_factor=scale, reduced_motion="reduce")
    page.goto(page_address, wait_until="load", timeout=PAGE_LOAD_TIMEOUT_MS)
    page.evaluate("document.fonts.ready")
    return page


def save_screenshot(page, arguments: argparse.Namespace) -> None:
    """Save the whole page, or only the browser window scrolled to the requested offset."""
    if arguments.window_at_scroll_y is None:
        page.screenshot(path=str(arguments.output_png), full_page=True)
        return
    page.evaluate("(offset) => window.scrollTo(0, offset)", arguments.window_at_scroll_y)
    page.screenshot(path=str(arguments.output_png), full_page=False)


def capture_mockup(arguments: argparse.Namespace, page_address: str) -> dict:
    """Open the page, save the screenshot and return the overflow and inner scroll report."""
    sync_playwright = import_playwright()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = open_page(browser, page_address, arguments, arguments.scale)
        page_height = page.evaluate(PAGE_HEIGHT_PROBE_SCRIPT)
        # Снимок одного окна всегда помещается в предел изображения — коэффициент не снижается.
        captures_whole_page = arguments.window_at_scroll_y is None
        scale = choose_device_scale_factor(page_height, arguments.scale) if captures_whole_page else arguments.scale
        if scale != arguments.scale:
            page.close()
            page = open_page(browser, page_address, arguments, scale)
        save_screenshot(page, arguments)
        report = page.evaluate(HIDDEN_OVERFLOW_PROBE_SCRIPT, CLIPPING_TOLERANCE_PX)
        report["innerScrollAreas"] = page.evaluate(INNER_SCROLL_PROBE_SCRIPT, CLIPPING_TOLERANCE_PX)
        browser.close()
    report.update(pageHeight=page_height, deviceScaleFactor=scale, scaleReduced=scale != arguments.scale,
                  horizontalPageScroll=report["pageScrollWidth"] > arguments.width,
                  windowAtScrollY=arguments.window_at_scroll_y)
    return report


def main() -> None:
    """Validate input, capture the page and print the overflow report as JSON."""
    arguments = parse_arguments()
    try:
        page_address = resolve_page_address(arguments.html, arguments.url)
        validate_window_scroll_offset(arguments.window_at_scroll_y)
    except ValueError as error:
        print(error, file=sys.stderr)
        raise SystemExit(EXIT_INPUT_ERROR)
    report = capture_mockup(arguments, page_address)
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
