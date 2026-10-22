"""Publish one landing project of the landing pipeline from designer on its run page at my.holdi.ai.

The run page is one permanent unguessable address per landing project with the sections «Доска вкуса» (taste board
pictures and the sites on them), «Варианты A/B/C» (the recipe candidates board) and «Страница» (the built site).
Every publication uploads all sections the project already has. Only showcase material is published: board pictures
and the site folder without notes and hidden files; research, prompts, decisions and open questions stay on the
machine. Address, upload and the public check are shared with the other pipelines: dev/pipelines/pipeline-run-page-publishing/.

  .venv/bin/python dev/pipelines/landing-pipeline-from-designer/tools/landing_pipeline_from_designer_run_page_publisher.py \
      --project-folder <рабочая папка>/projects/<slug> --product-name "<название>" --section taste-board
"""
import argparse
import re
import sys
from pathlib import Path

# Общая часть выкладки — dev/pipelines/pipeline-run-page-publishing/, на два уровня выше папки tools/ плагина.
SHARED_PUBLISHING_FOLDER = Path(__file__).resolve().parents[2] / "pipeline-run-page-publishing"
sys.path.insert(0, str(SHARED_PUBLISHING_FOLDER))
import pipeline_run_page_publishing as run_page_publishing  # noqa: E402

# Имя папки проекта становится частью адреса <slug>-<код>: латиница, цифры и дефисы.
PROJECT_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TASTE_BOARD_SECTION = "taste-board"
RECIPE_VARIANTS_SECTION = "recipe-variants"
LANDING_PAGE_SECTION = "landing-page"
SECTION_ORDER = (TASTE_BOARD_SECTION, RECIPE_VARIANTS_SECTION, LANDING_PAGE_SECTION)
SECTION_TITLES = {TASTE_BOARD_SECTION: "Доска вкуса", RECIPE_VARIANTS_SECTION: "Варианты A/B/C",
                  LANDING_PAGE_SECTION: "Страница"}
# Доски рисует scripts/taste-board.mjs: снимок <имя>.png и список ссылок <имя>-links.md. HTML доски ссылается на
# картинки внутри плагина (file://) и на странице запуска не открылся бы, поэтому выкладывается снимок.
BOARD_PICTURE_GLOBS = {TASTE_BOARD_SECTION: "taste-board*.png", RECIPE_VARIANTS_SECTION: "recipe-board*.png"}
BOARD_LINKS_FILE_SUFFIX = "-links.md"
# Строка списка ссылок доски: «- 1. linear — https://linear.app — спокойный, графитовый».
BOARD_LINK_LINE_PATTERN = re.compile(
    r"^-\s+(?P<number>[^.\s]+)\.\s+(?P<name>.+?)\s+—\s+(?P<url>https?://\S+)\s+—\s*(?P<mood>.*)$")
SITE_FOLDER_NAME = "site"
SITE_PAGE_PATH = "site/index.html"
SITE_PAGE_LINK_TEXT = "Открыть страницу"
# Заметки и скрытые файлы (.env и подобные) остаются на машине.
EXCLUDED_FILE_SUFFIX = ".md"
HIDDEN_NAME_PREFIX = "."


def project_slug(project_folder: Path) -> str:
    """Return the slug of a project folder, refusing a name that cannot be part of the run page address."""
    if not PROJECT_SLUG_PATTERN.match(project_folder.name):
        raise ValueError(f"имя папки проекта — не slug латиницей через дефис: {project_folder.name}")
    return project_folder.name


def board_pictures(project_folder: Path, section: str) -> list[Path]:
    """Return the board pictures of a section in name order, empty before the stage draws one."""
    return sorted(project_folder.glob(BOARD_PICTURE_GLOBS[section]))


def _link_text(match: re.Match) -> str:
    """Build the link text of one board line: number, site name and mood."""
    mood = match["mood"].strip()
    return f"{match['number']}. {match['name']}" + (f" — {mood}" if mood else "")


def board_links(picture: Path) -> tuple[tuple[str, str], ...]:
    """Return (text, site address) pairs from the links list next to a board picture; sites without an address are skipped."""
    links_file = picture.with_name(picture.stem + BOARD_LINKS_FILE_SUFFIX)
    if not links_file.is_file():
        return ()
    lines = links_file.read_text(encoding="utf-8").splitlines()
    matches = [BOARD_LINK_LINE_PATTERN.match(line.strip()) for line in lines]
    return tuple((_link_text(match), match["url"]) for match in matches if match)


def _is_showcase_file(path_in_site: Path) -> bool:
    """Tell whether a site file is shown: not a note and not hidden."""
    if any(part.startswith(HIDDEN_NAME_PREFIX) for part in path_in_site.parts):
        return False
    return path_in_site.suffix != EXCLUDED_FILE_SUFFIX


def site_files(project_folder: Path) -> list[tuple[Path, str]]:
    """List the shown files of the built site with their run page paths, empty before the build stage."""
    site_folder = project_folder / SITE_FOLDER_NAME
    if not (project_folder / SITE_PAGE_PATH).is_file():
        return []
    files = run_page_publishing.tree_files(site_folder, SITE_FOLDER_NAME)
    return [(source, published) for source, published in files if _is_showcase_file(source.relative_to(site_folder))]


def showcase_files(project_folder: Path) -> list[tuple[Path, str]]:
    """List every shown file of a project: board pictures at the page root and the site under site/."""
    pictures = [picture for section in BOARD_PICTURE_GLOBS for picture in board_pictures(project_folder, section)]
    return [(picture, picture.name) for picture in pictures] + site_files(project_folder)


def _board_section(project_folder: Path, section: str) -> run_page_publishing.IndexSection | None:
    """Build the index section of a board: its pictures and the sites on them, or None before the board exists."""
    pictures = board_pictures(project_folder, section)
    if not pictures:
        return None
    links = tuple(link for picture in pictures for link in board_links(picture))
    return run_page_publishing.IndexSection(anchor=section, title=SECTION_TITLES[section], links=links,
                                            images=tuple(picture.name for picture in pictures))


def index_sections(project_folder: Path) -> list[run_page_publishing.IndexSection]:
    """Build the index sections the project already has, in stage order."""
    sections = [_board_section(project_folder, section) for section in BOARD_PICTURE_GLOBS]
    if site_files(project_folder):
        sections.append(run_page_publishing.IndexSection(
            anchor=LANDING_PAGE_SECTION, title=SECTION_TITLES[LANDING_PAGE_SECTION],
            links=((SITE_PAGE_LINK_TEXT, SITE_PAGE_PATH),)))
    return [section for section in sections if section is not None]


def checked_pages(files: list[tuple[Path, str]]) -> list[str]:
    """Return the published paths to check at the public address: board pictures and the site page."""
    return [published for _, published in files if published == SITE_PAGE_PATH or "/" not in published]


def publish_landing_project(project_folder: Path, product_name: str, section: str, page_url: str) -> None:
    """Upload every section the project has, save the page address and check the index and the shown pages."""
    sections = index_sections(project_folder)
    if section not in {existing.anchor for existing in sections}:
        raise ValueError(f"в проекте ещё нет материала раздела «{SECTION_TITLES[section]}»: {project_folder}")
    files = showcase_files(project_folder)
    index_html = run_page_publishing.index_page(product_name, sections)
    run_page_publishing.publish_run_page(project_folder, page_url, files, index_html, checked_pages(files))


def publish_from_arguments(arguments: argparse.Namespace) -> list[str]:
    """Publish the project of the parsed arguments and return the page address and the shown section link lines."""
    project_folder = Path(arguments.project_folder).resolve()
    if not project_folder.is_dir():
        raise ValueError(f"папки проекта нет: {project_folder}")
    slug = project_slug(project_folder)
    page_url = run_page_publishing.stored_page_url(project_folder) or run_page_publishing.new_page_url(slug)
    publish_landing_project(project_folder, arguments.product_name, arguments.section, page_url)
    return [f"Страница запуска: {page_url}", f"{SECTION_TITLES[arguments.section]}: {page_url}#{arguments.section}"]


def _parse_arguments() -> argparse.Namespace:
    """Read the project folder, the product name and the section being shown."""
    parser = argparse.ArgumentParser(description="Выложить проект лендинга на страницу запуска my.holdi.ai.")
    parser.add_argument("--project-folder", type=Path, required=True, help="папка проекта projects/<slug>")
    parser.add_argument("--product-name", required=True, help="название продукта для заголовка страницы")
    parser.add_argument("--section", choices=SECTION_ORDER, required=True,
                        help="показываемый раздел: taste-board, recipe-variants или landing-page")
    return parser.parse_args()


def main() -> int:
    """Publish the project and print the run page address and the direct link of the shown section."""
    arguments = _parse_arguments()
    return run_page_publishing.run_publication(lambda: publish_from_arguments(arguments))


if __name__ == "__main__":
    sys.exit(main())
