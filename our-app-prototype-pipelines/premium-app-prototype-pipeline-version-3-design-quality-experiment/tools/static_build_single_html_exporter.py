"""Pack a static demo build (index.html + assets + media) into one self-contained HTML file that opens from disk.

Scripts and stylesheets are inlined, fonts inside stylesheets become data URIs, and files of an optional media
folder are embedded and served to <audio>/<video> elements through a small runtime shim, so the demo works
without a server (file://). The build itself is not changed. An optional start route opens the file on a hash
route (for example the frame list of the screens review) unless the opened address already has one.

  python3 static_build_single_html_exporter.py --dist app/dist --output holdi-demo.html --media-folder audio
  python3 static_build_single_html_exporter.py --dist app/dist --output holdi-screens.html --start-route "#/frames"
"""
import argparse
import base64
import json
import mimetypes
import re
import sys
from pathlib import Path

EXIT_INPUT_ERROR = 2
SCRIPT_TAG_PATTERN = re.compile(r'<script type="module"[^>]*\bsrc="([^"]+)"[^>]*></script>')
STYLESHEET_TAG_PATTERN = re.compile(r'<link rel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>')
CSS_URL_PATTERN = re.compile(r"url\((['\"]?)(?!data:)([^'\")]+)\1\)")
# Скрипт не должен закрыть свой тег раньше времени: «</script» внутри кода экранируется.
SCRIPT_CLOSING_SEQUENCE = "</script"
ESCAPED_SCRIPT_CLOSING_SEQUENCE = "<\\/script"
# Стартовый маршрут — адрес после «#», чтобы работал и с диска (file://), без сервера.
START_ROUTE_PREFIX = "#/"
# Ставит стартовый маршрут до запуска приложения, если в открытом адресе маршрута ещё нет.
START_ROUTE_SCRIPT_TEMPLATE = "<script>if (!location.hash) { location.hash = %s; }</script>"
# Подмена адреса медиафайла на встроенный data URI при присваивании src у <audio>/<video>.
MEDIA_SHIM_TEMPLATE = """<script>
(function () {
  var embeddedMedia = %s;
  var descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    configurable: true,
    get: function () { return descriptor.get.call(this); },
    set: function (value) { descriptor.set.call(this, embeddedMedia[String(value).replace(/^\\.\\//, '')] || value); }
  });
})();
</script>"""


def data_uri(file_path: Path) -> str:
    """Encode one file as a data URI with its media type."""
    media_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    return f"data:{media_type};base64,{base64.b64encode(file_path.read_bytes()).decode('ascii')}"


def inline_stylesheet(stylesheet_path: Path) -> str:
    """Return the stylesheet text with every relative url(...) replaced by a data URI."""
    css_text = stylesheet_path.read_text(encoding="utf-8")
    replace_url = lambda match: f"url({data_uri((stylesheet_path.parent / match.group(2)).resolve())})"
    return CSS_URL_PATTERN.sub(replace_url, css_text)


def media_shim(dist_folder: Path, media_folder: str) -> str:
    """Build the runtime shim that maps relative media paths to embedded data URIs."""
    media_root = dist_folder / media_folder
    embedded = {str(path.relative_to(dist_folder)): data_uri(path) for path in sorted(media_root.rglob("*")) if path.is_file()}
    return MEDIA_SHIM_TEMPLATE % json.dumps(embedded)


def start_route_script(start_route: str) -> str:
    """Build the inline script that opens the file on the start route; the route must start with #/."""
    if not start_route.startswith(START_ROUTE_PREFIX):
        raise ValueError(f"Start route must start with {START_ROUTE_PREFIX}: {start_route}")
    return START_ROUTE_SCRIPT_TEMPLATE % json.dumps(start_route)


def single_html(dist_folder: Path, media_folder: str | None, start_route: str | None = None) -> str:
    """Assemble the self-contained HTML text from the build folder."""
    html = (dist_folder / "index.html").read_text(encoding="utf-8")
    inline_style = lambda match: f"<style>{inline_stylesheet(dist_folder / match.group(1))}</style>"
    html = STYLESHEET_TAG_PATTERN.sub(inline_style, html)
    shim = media_shim(dist_folder, media_folder) if media_folder else ""
    if start_route:
        shim = start_route_script(start_route) + shim
    def inline_script(match):
        code = (dist_folder / match.group(1)).read_text(encoding="utf-8").replace(SCRIPT_CLOSING_SEQUENCE, ESCAPED_SCRIPT_CLOSING_SEQUENCE)
        return f'{shim}<script type="module">{code}</script>'
    html = SCRIPT_TAG_PATTERN.sub(inline_script, html)
    return html


def parse_arguments() -> argparse.Namespace:
    """Read CLI options."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dist", required=True, type=Path, help="static build folder with index.html")
    parser.add_argument("--output", required=True, type=Path, help="single HTML file to write")
    parser.add_argument("--media-folder", help="folder inside the build whose files are embedded for <audio>/<video>")
    parser.add_argument("--start-route", help="hash route the file opens on when none is given, e.g. #/frames")
    return parser.parse_args()


def main() -> None:
    """Validate the build folder, write the single HTML file and report its size."""
    arguments = parse_arguments()
    if not (arguments.dist / "index.html").is_file():
        print(f"No index.html in build folder: {arguments.dist}", file=sys.stderr)
        raise SystemExit(EXIT_INPUT_ERROR)
    if arguments.media_folder and not (arguments.dist / arguments.media_folder).is_dir():
        print(f"Media folder not found: {arguments.dist / arguments.media_folder}", file=sys.stderr)
        raise SystemExit(EXIT_INPUT_ERROR)
    try:
        html = single_html(arguments.dist, arguments.media_folder, arguments.start_route)
    except ValueError as error:
        print(error, file=sys.stderr)
        raise SystemExit(EXIT_INPUT_ERROR)
    arguments.output.write_text(html, encoding="utf-8")
    print(f"written {arguments.output} ({arguments.output.stat().st_size / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
