"""Publish the showcase of one app prototype pipeline run as its run page on my.holdi.ai.

The run page is one permanent unguessable address per run: an index with the sections «Раскладки», «Дизайны»,
«Экраны», «Демо» and, under it, the galleries and live HTML of the variants. Only showcase material is published:
galleries, key screens with their assets, screen frames, the live screens file and the packaged demo. Review
passes, self-checks, notes, research, references and session files stay local. Address, upload and the public
check are shared with the landing pipeline: dev/pipelines/pipeline-run-page-publishing/.

  .venv/bin/python prototype_run_page_publisher.py --run-folder dev/pipeline-workspace/<run> \
      --product-name "Холди" --section windows
"""
import argparse
import re
import sys
from pathlib import Path

# Общая часть выкладки — в dev/pipelines/pipeline-run-page-publishing/, на два уровня выше папки tools/.
SHARED_PUBLISHING_FOLDER = Path(__file__).resolve().parents[2] / "pipeline-run-page-publishing"
sys.path.insert(0, str(SHARED_PUBLISHING_FOLDER))
import pipeline_run_page_publishing as run_page_publishing  # noqa: E402

RUN_FOLDER_NAME_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-([a-z0-9-]+)$")
PREVIOUS_ROUND_FOLDER_PATTERN = re.compile(r"^round-(\d+)$")
GALLERY_FILE_NAME = "gallery.html"
VARIANT_PAGE_FILE_NAME = "key-screen.html"
VARIANT_SNAPSHOT_FILE_NAME = "key-screen.png"
VARIANT_ASSETS_FOLDER_NAME = "assets"
FRAME_SNAPSHOT_GLOB = "frames/*/window.png"
LIVE_SCREENS_FILE_SUFFIX = "-screens.html"
# Этап 25 пишет HANDOFF.md: его наличие значит, что демо упаковано и проверено.
DEMO_READY_MARKER_FILE_NAME = "HANDOFF.md"
DEMO_BUILD_FOLDER = "app/dist"
LANDING_FRAMES_FOLDER = "landing/frames"
LANDING_FRAMES_PUBLISHED_PREFIX = "demo/landing-frames"
SECTION_TITLES = {"layouts": "Раскладки", "designs": "Дизайны", "windows": "Экраны", "demo": "Демо"}
SECTION_DIRECT_PAGES = {"layouts": "layouts/gallery.html", "designs": "designs/gallery.html",
                        "windows": "windows/gallery.html", "demo": "demo/index.html"}
SECTION_MAIN_LINK_TEXTS = {"layouts": "Галерея текущего круга", "designs": "Галерея текущего круга",
                           "windows": "Галерея экранов", "demo": "Открыть демо"}
LIVE_SCREENS_LINK_TEXT = "Живые экраны (листаются кнопкой «Вперёд →»)"
PREVIOUS_ROUND_LINK_TEMPLATE = "Круг {number}"


def new_page_url(run_folder: Path) -> str:
    """Return a new unguessable run page address: product part of the run folder name plus a random code."""
    match = RUN_FOLDER_NAME_PATTERN.match(run_folder.name)
    if not match:
        raise ValueError(f"имя папки запуска не похоже на <UTC-время>Z-<продукт>: {run_folder.name}")
    return run_page_publishing.new_page_url(match.group(1))


def _variant_files(variant_folder: Path, published_prefix: str) -> list[tuple[Path, str]]:
    """List the key screen page and snapshot of one variant with every file of its assets folder."""
    named = [variant_folder / name for name in (VARIANT_PAGE_FILE_NAME, VARIANT_SNAPSHOT_FILE_NAME)]
    files = [(path, f"{published_prefix}/{path.name}") for path in named if path.is_file()]
    assets_prefix = f"{published_prefix}/{VARIANT_ASSETS_FOLDER_NAME}"
    return files + run_page_publishing.tree_files(variant_folder / VARIANT_ASSETS_FOLDER_NAME, assets_prefix)


def _gallery_with_variants_files(gallery_folder: Path, published_prefix: str) -> list[tuple[Path, str]]:
    """List a gallery page and every variant folder beside it that has a key screen page."""
    files = [(gallery_folder / GALLERY_FILE_NAME, f"{published_prefix}/{GALLERY_FILE_NAME}")]
    variant_folders = sorted(path for path in gallery_folder.iterdir() if (path / VARIANT_PAGE_FILE_NAME).is_file())
    for variant_folder in variant_folders:
        files += _variant_files(variant_folder, f"{published_prefix}/{variant_folder.name}")
    return files


def _variant_section_files(run_folder: Path, section: str) -> list[tuple[Path, str]]:
    """List the current and previous-round galleries of the layouts or designs section with their variants."""
    section_folder = run_folder / section
    if not (section_folder / GALLERY_FILE_NAME).is_file():
        return []
    files = _gallery_with_variants_files(section_folder, section)
    for round_folder in sorted(section_folder.iterdir()):
        if PREVIOUS_ROUND_FOLDER_PATTERN.match(round_folder.name) and (round_folder / GALLERY_FILE_NAME).is_file():
            files += _gallery_with_variants_files(round_folder, f"{section}/{round_folder.name}")
    return files


def _windows_section_files(run_folder: Path) -> list[tuple[Path, str]]:
    """List the screens gallery, its frame snapshots and the self-contained live screens page."""
    windows_folder = run_folder / "windows"
    if not (windows_folder / GALLERY_FILE_NAME).is_file():
        return []
    chosen = [windows_folder / GALLERY_FILE_NAME, *sorted(windows_folder.glob(FRAME_SNAPSHOT_GLOB)),
              *sorted(windows_folder.glob(f"*{LIVE_SCREENS_FILE_SUFFIX}"))]
    return [(path, f"windows/{path.relative_to(windows_folder).as_posix()}") for path in chosen]


def _demo_section_files(run_folder: Path) -> list[tuple[Path, str]]:
    """List the packaged demo build and landing frames once stage 25 has written HANDOFF.md."""
    if not (run_folder / DEMO_READY_MARKER_FILE_NAME).is_file():
        return []
    demo_files = run_page_publishing.tree_files(run_folder / DEMO_BUILD_FOLDER, "demo")
    return demo_files + run_page_publishing.tree_files(run_folder / LANDING_FRAMES_FOLDER,
                                                       LANDING_FRAMES_PUBLISHED_PREFIX)


def showcase_files(run_folder: Path) -> list[tuple[Path, str]]:
    """List every showcase file of the run with its path on the run page."""
    return (_variant_section_files(run_folder, "layouts") + _variant_section_files(run_folder, "designs")
            + _windows_section_files(run_folder) + _demo_section_files(run_folder))


def _previous_round_links(section: str, published_paths: set[str]) -> list[tuple[str, str]]:
    """Return links to the previous-round galleries of a section, newest round first."""
    pattern = re.compile(rf"^{section}/round-(\d+)/{GALLERY_FILE_NAME}$")
    rounds = sorted((int(match.group(1)), path) for path in published_paths if (match := pattern.match(path)))
    return [(PREVIOUS_ROUND_LINK_TEMPLATE.format(number=number), path) for number, path in reversed(rounds)]


def _live_screens_links(section: str, published_paths: set[str]) -> list[tuple[str, str]]:
    """Return links to the self-contained live screens pages published in a section."""
    live_pages = sorted(path for path in published_paths
                        if path.startswith(f"{section}/") and path.endswith(LIVE_SCREENS_FILE_SUFFIX))
    return [(LIVE_SCREENS_LINK_TEXT, path) for path in live_pages]


def _landing_frame_images(section: str, published_paths: set[str]) -> tuple[str, ...]:
    """Return the landing frame paths shown in the demo section, empty for other sections."""
    if section != "demo":
        return ()
    prefix = f"{LANDING_FRAMES_PUBLISHED_PREFIX}/"
    return tuple(sorted(path for path in published_paths if path.startswith(prefix)))


def _index_section(section: str, published_paths: set[str]) -> run_page_publishing.IndexSection:
    """Build one index section: the main page link, live screens or earlier rounds, and landing frames."""
    links = [(SECTION_MAIN_LINK_TEXTS[section], SECTION_DIRECT_PAGES[section])]
    links += _live_screens_links(section, published_paths) + _previous_round_links(section, published_paths)
    return run_page_publishing.IndexSection(anchor=section, title=SECTION_TITLES[section], links=tuple(links),
                                            images=_landing_frame_images(section, published_paths))


def index_page(product_name: str, published_paths: set[str]) -> str:
    """Build the run page index with a section for every showcase part that is published."""
    present_sections = [section for section in SECTION_TITLES if SECTION_DIRECT_PAGES[section] in published_paths]
    sections = [_index_section(section, published_paths) for section in present_sections]
    return run_page_publishing.index_page(product_name, sections)


def publish_app_run_page(run_folder: Path, product_name: str, section: str, page_url: str) -> None:
    """Upload the current showcase to the run page, save its address and check the index and the shown section."""
    files = showcase_files(run_folder)
    published_paths = {path for _, path in files}
    if SECTION_DIRECT_PAGES[section] not in published_paths:
        raise ValueError(f"в папке запуска нет материала раздела «{SECTION_TITLES[section]}»")
    index_html = index_page(product_name, published_paths)
    run_page_publishing.publish_run_page(run_folder, page_url, files, index_html, [SECTION_DIRECT_PAGES[section]])


def _parse_arguments() -> argparse.Namespace:
    """Read the run folder, the product name and the section being shown."""
    parser = argparse.ArgumentParser(description="Выложить материал показа запуска на страницу запуска my.holdi.ai.")
    parser.add_argument("--run-folder", type=Path, required=True, help="папка запуска dev/pipeline-workspace/<…>")
    parser.add_argument("--product-name", required=True, help="название продукта для заголовка страницы")
    parser.add_argument("--section", choices=sorted(SECTION_TITLES), required=True, help="раздел, который показывается")
    return parser.parse_args()


def _publish(arguments: argparse.Namespace) -> list[str]:
    """Publish the run page for the parsed arguments and return the page address and the section link lines."""
    run_folder = arguments.run_folder.resolve()
    if not run_folder.is_dir():
        raise ValueError(f"папки запуска нет: {run_folder}")
    page_url = run_page_publishing.stored_page_url(run_folder) or new_page_url(run_folder)
    publish_app_run_page(run_folder, arguments.product_name, arguments.section, page_url)
    section_link = f"{page_url}{SECTION_DIRECT_PAGES[arguments.section]}"
    return [f"Страница запуска: {page_url}", f"{SECTION_TITLES[arguments.section]}: {section_link}"]


def main() -> int:
    """Publish the run page and print its address and the direct link of the shown section."""
    arguments = _parse_arguments()
    return run_page_publishing.run_publication(lambda: _publish(arguments))


if __name__ == "__main__":
    sys.exit(main())
