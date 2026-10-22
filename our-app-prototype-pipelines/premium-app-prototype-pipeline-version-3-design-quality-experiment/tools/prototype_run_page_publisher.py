"""Publish the showcase of one app prototype pipeline run as its run page on my.holdi.ai.

The run page is one permanent unguessable address per run, shown like the landing run page: an index with the
sections «Раскладки», «Дизайны», «Экраны» linking the live HTML pages — the key screen page of every variant (with
earlier rounds in their own sections) and the self-contained live screens file. Only those pages and the variants'
assets are published: no galleries, snapshots, notes, reviews, research, references or session files. Address,
upload and the public check are shared with the landing pipeline: dev/pipelines/pipeline-run-page-publishing/.

  .venv/bin/python prototype_run_page_publisher.py --run-folder dev/pipeline-workspace/<run> \
      --product-name "Холди" --section designs
"""
import argparse
import re
import sys
from pathlib import Path, PurePosixPath

# Общая часть выкладки — в dev/pipelines/pipeline-run-page-publishing/, на два уровня выше папки tools/.
SHARED_PUBLISHING_FOLDER = Path(__file__).resolve().parents[2] / "pipeline-run-page-publishing"
sys.path.insert(0, str(SHARED_PUBLISHING_FOLDER))
import pipeline_run_page_publishing as run_page_publishing  # noqa: E402

RUN_FOLDER_NAME_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-([a-z0-9-]+)$")
PREVIOUS_ROUND_FOLDER_PATTERN = re.compile(r"^round-(\d+)$")
VARIANT_PAGE_FILE_NAME = "key-screen.html"
VARIANT_ASSETS_FOLDER_NAME = "assets"
LIVE_SCREENS_FILE_SUFFIX = "-screens.html"
VARIANT_SECTIONS = ("layouts", "designs")
SECTION_TITLES = {"layouts": "Раскладки", "designs": "Дизайны", "windows": "Экраны"}
PREVIOUS_ROUND_TITLE_TEMPLATE = "{section_title}, прежний круг {number}"
LIVE_SCREENS_LINK_TEXT = "Все экраны (листаются кнопкой «Вперёд →»)"
# Авторы дизайнов пишут название варианта в <title> в кавычках-«ёлочках»: «Лента времени встречи».
PAGE_TITLE_PATTERN = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)
VARIANT_NAME_PATTERN = re.compile(r"«[^»]+»")
# Основа этапа 16 — дизайн, выбранный Иваном в прежнем запуске; на странице подписывается словами, а не именем папки.
ACCEPTED_DESIGN_FOLDER_NAME = "accepted-design"
ACCEPTED_DESIGN_LINK_LABEL = "Принятый дизайн"


def new_page_url(run_folder: Path) -> str:
    """Return a new unguessable run page address: product part of the run folder name plus a random code."""
    match = RUN_FOLDER_NAME_PATTERN.match(run_folder.name)
    if not match:
        raise ValueError(f"имя папки запуска не похоже на <UTC-время>Z-<продукт>: {run_folder.name}")
    return run_page_publishing.new_page_url(match.group(1))


def _variant_files(variant_folder: Path, published_prefix: str) -> list[tuple[Path, str]]:
    """List the key screen page of one variant with every file of its assets folder."""
    page = (variant_folder / VARIANT_PAGE_FILE_NAME, f"{published_prefix}/{VARIANT_PAGE_FILE_NAME}")
    assets_prefix = f"{published_prefix}/{VARIANT_ASSETS_FOLDER_NAME}"
    return [page] + run_page_publishing.tree_files(variant_folder / VARIANT_ASSETS_FOLDER_NAME, assets_prefix)


def _round_files(round_folder: Path, published_prefix: str) -> list[tuple[Path, str]]:
    """List the pages and assets of every variant folder of one round that has a key screen page."""
    variant_folders = sorted(path for path in round_folder.iterdir() if (path / VARIANT_PAGE_FILE_NAME).is_file())
    return [file for folder in variant_folders for file in _variant_files(folder, f"{published_prefix}/{folder.name}")]


def _variant_section_files(run_folder: Path, section: str) -> list[tuple[Path, str]]:
    """List the variants of the current round and of every previous round of the layouts or designs section."""
    section_folder = run_folder / section
    if not section_folder.is_dir():
        return []
    files = _round_files(section_folder, section)
    for round_folder in sorted(section_folder.iterdir()):
        if round_folder.is_dir() and PREVIOUS_ROUND_FOLDER_PATTERN.match(round_folder.name):
            files += _round_files(round_folder, f"{section}/{round_folder.name}")
    return files


def _windows_section_files(run_folder: Path) -> list[tuple[Path, str]]:
    """List the self-contained live screens pages of the screens section."""
    live_pages = sorted((run_folder / "windows").glob(f"*{LIVE_SCREENS_FILE_SUFFIX}"))
    return [(path, f"windows/{path.name}") for path in live_pages]


def showcase_files(run_folder: Path) -> list[tuple[Path, str]]:
    """List every showcase file of the run with its path on the run page."""
    variant_files = [file for section in VARIANT_SECTIONS for file in _variant_section_files(run_folder, section)]
    return variant_files + _windows_section_files(run_folder)


def _page_round(published_path: str) -> int | None:
    """Return the previous-round number of a variant page path, or None for the current round."""
    match = PREVIOUS_ROUND_FOLDER_PATTERN.match(PurePosixPath(published_path).parts[1])
    return int(match.group(1)) if match else None


def section_pages(section: str, files: list[tuple[Path, str]]) -> list[str]:
    """Return the published live pages of the current round of a section, in path order."""
    if section == "windows":
        return sorted(path for _, path in files if path.startswith("windows/"))
    pages = [path for _, path in files if path.startswith(f"{section}/") and path.endswith(VARIANT_PAGE_FILE_NAME)]
    return sorted(path for path in pages if _page_round(path) is None)


def variant_link_text(page_source: Path) -> str:
    """Return the variant ID with its name from the page title, e.g. design-01 «Лента времени встречи»."""
    folder_name = page_source.parent.name
    variant_id = ACCEPTED_DESIGN_LINK_LABEL if folder_name == ACCEPTED_DESIGN_FOLDER_NAME else folder_name
    title_match = PAGE_TITLE_PATTERN.search(page_source.read_text(encoding="utf-8", errors="replace"))
    name_match = VARIANT_NAME_PATTERN.search(title_match.group(1)) if title_match else None
    return f"{variant_id} {name_match.group(0)}" if name_match else variant_id


def _variant_index_sections(section: str, files: list[tuple[Path, str]]) -> list[run_page_publishing.IndexSection]:
    """Build the index sections of a variant section: the current round, then previous rounds, newest first."""
    rounds: dict[int | None, list[tuple[str, str]]] = {}
    for source, path in sorted(files, key=lambda file: file[1]):
        if path.startswith(f"{section}/") and path.endswith(VARIANT_PAGE_FILE_NAME):
            rounds.setdefault(_page_round(path), []).append((variant_link_text(source), path))
    sections = []
    if None in rounds:
        sections.append(run_page_publishing.IndexSection(section, SECTION_TITLES[section], tuple(rounds[None])))
    for number in sorted((key for key in rounds if key is not None), reverse=True):
        title = PREVIOUS_ROUND_TITLE_TEMPLATE.format(section_title=SECTION_TITLES[section], number=number)
        sections.append(run_page_publishing.IndexSection(f"{section}-round-{number}", title, tuple(rounds[number])))
    return sections


def index_page(product_name: str, files: list[tuple[Path, str]]) -> str:
    """Build the run page index: live variant pages by section and round, then the live screens page."""
    sections = [block for section in VARIANT_SECTIONS for block in _variant_index_sections(section, files)]
    screens = [(LIVE_SCREENS_LINK_TEXT, path) for path in section_pages("windows", files)]
    if screens:
        sections.append(run_page_publishing.IndexSection("windows", SECTION_TITLES["windows"], tuple(screens)))
    return run_page_publishing.index_page(product_name, sections)


def publish_app_run_page(run_folder: Path, product_name: str, section: str, page_url: str) -> None:
    """Upload the current showcase to the run page, save its address and check the index and the shown pages."""
    files = showcase_files(run_folder)
    pages = section_pages(section, files)
    if not pages:
        raise ValueError(f"в папке запуска нет живых страниц раздела «{SECTION_TITLES[section]}»")
    run_page_publishing.publish_run_page(run_folder, page_url, files, index_page(product_name, files), pages)


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
    return [f"Страница запуска: {page_url}", f"{SECTION_TITLES[arguments.section]}: {page_url}#{arguments.section}"]


def main() -> int:
    """Publish the run page and print its address and the direct link of the shown section."""
    arguments = _parse_arguments()
    return run_page_publishing.run_publication(lambda: _publish(arguments))


if __name__ == "__main__":
    sys.exit(main())
