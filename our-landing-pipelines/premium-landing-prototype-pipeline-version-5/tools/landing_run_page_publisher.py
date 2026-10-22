"""Publish the finished stages of one landing prototype pipeline run as its run page on my.holdi.ai.

The run page is one permanent unguessable address per run: an index with a section per stage — «Этап 0. Образцы»,
«Этап 1. Прототип», «Этап 2. Три направления», «Этап 3. Страница с движением», «Этап 4. Готовый лендинг» — linking
the live HTML pages of the stage. Stages from the first to the shown one are published whole, without scroll-check
and reference frames (lab/), node_modules/, notes (*.md) and hidden files; later stage folders stay local because
that stage may still run. With --pipeline visuals-before-layout the index names the stages of the landing from
reference visuals before layout pipeline — «Этап 2. Визуалы», «Этап 3. Готовый лендинг».
Address, upload and the public check are shared with the app pipeline: dev/pipelines/pipeline-run-page-publishing/.

  .venv/bin/python landing_run_page_publisher.py --run-folder dev/pipeline-workspace/<run> \
      --product-name "Холди" --stage 1 [--pipeline visuals-before-layout]
"""
import argparse
import re
import sys
from pathlib import Path, PurePosixPath

# Общая часть выкладки — в dev/pipelines/pipeline-run-page-publishing/, на два уровня выше папки tools/.
SHARED_PUBLISHING_FOLDER = Path(__file__).resolve().parents[2] / "pipeline-run-page-publishing"
sys.path.insert(0, str(SHARED_PUBLISHING_FOLDER))
import pipeline_run_page_publishing as run_page_publishing  # noqa: E402

# Папка запуска — <ГГГГ-ММ-ДД>-<продукт>-landing (README пайплайна, «Папка запуска»); адрес — <продукт>-landing-<код>.
RUN_FOLDER_NAME_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}-([a-z0-9-]+-landing)$")
VERSION_5_STAGE_TITLES = {0: "Этап 0. Образцы", 1: "Этап 1. Прототип", 2: "Этап 2. Три направления",
                          3: "Этап 3. Страница с движением", 4: "Этап 4. Готовый лендинг"}
# План этапа 1 — документ, а не страница: у пайплайна «визуалы до вёрстки» на странице запуска только этапы 2 и 3.
VISUALS_BEFORE_LAYOUT_STAGE_TITLES = {2: "Этап 2. Визуалы", 3: "Этап 3. Готовый лендинг"}
# Пайплайн версии 5 и пайплайн по референсу в новом стиле выкладываются с названиями версии 5.
VERSION_5_PIPELINE = "version-5"
VISUALS_BEFORE_LAYOUT_PIPELINE = "visuals-before-layout"
STAGE_TITLES_BY_PIPELINE = {VERSION_5_PIPELINE: VERSION_5_STAGE_TITLES,
                            VISUALS_BEFORE_LAYOUT_PIPELINE: VISUALS_BEFORE_LAYOUT_STAGE_TITLES}
ALL_STAGE_NUMBERS = sorted({number for titles in STAGE_TITLES_BY_PIPELINE.values() for number in titles})
# Первый этап запуска — поиск образцов; прогоны до версии 5.1 его не имеют, и пропущенная папка не выкладывается.
FIRST_STAGE_NUMBER = min(ALL_STAGE_NUMBERS)
# Имя папки этапа в папке запуска; оно же — якорь раздела этапа в оглавлении.
STAGE_FOLDER_TEMPLATE = "stage-{number}"
# Кадры проверки прокруткой, сырые кадры образцов и зависимости съёмщика — рабочие файлы, а не материал показа.
EXCLUDED_FOLDER_NAMES = frozenset({"lab", "node_modules"})
# Заметки этапа и промпты визуалов остаются на машине.
EXCLUDED_FILE_SUFFIX = ".md"
HIDDEN_NAME_PREFIX = "."
# HTML/SVG-исходники визуалов — части страниц, а не страницы для оглавления.
VISUALS_FOLDER_NAME = "visuals"
PAGE_FILE_SUFFIX = ".html"
# Ссылки оглавления открывают чистый просмотр без аннотаций — «Правила для всех этапов», «Аннотации визуальных зон».
CLEAN_VIEW_QUERY = "?clean"


def new_page_url(run_folder: Path) -> str:
    """Return a new unguessable run page address: <product>-landing from the run folder name plus a random code."""
    match = RUN_FOLDER_NAME_PATTERN.match(run_folder.name)
    if not match:
        raise ValueError(f"имя папки запуска не похоже на <ГГГГ-ММ-ДД>-<продукт>-landing: {run_folder.name}")
    return run_page_publishing.new_page_url(match.group(1))


def stage_titles_of_pipeline(pipeline: str, stage: int) -> dict[int, str]:
    """Return the stage titles of a pipeline, refusing a shown stage that its run page does not have."""
    stage_titles = STAGE_TITLES_BY_PIPELINE[pipeline]
    if stage not in stage_titles:
        raise ValueError(f"у пайплайна {pipeline} на странице запуска нет этапа {stage}: "
                         f"есть {sorted(stage_titles)}")
    return stage_titles


def _is_showcase_file(path_in_stage: Path) -> bool:
    """Tell whether a file of a stage folder is shown: not a note, not hidden, not under lab/ or node_modules/."""
    for part in path_in_stage.parts:
        if part.startswith(HIDDEN_NAME_PREFIX) or part in EXCLUDED_FOLDER_NAMES:
            return False
    return path_in_stage.suffix != EXCLUDED_FILE_SUFFIX


def _stage_files(run_folder: Path, number: int) -> list[tuple[Path, str]]:
    """List the shown files of one stage folder with their run page paths, empty when the folder is missing."""
    stage_name = STAGE_FOLDER_TEMPLATE.format(number=number)
    stage_folder = run_folder / stage_name
    if not stage_folder.is_dir():
        return []
    files = sorted(path for path in stage_folder.rglob("*") if path.is_file())
    return [(path, f"{stage_name}/{path.relative_to(stage_folder).as_posix()}")
            for path in files if _is_showcase_file(path.relative_to(stage_folder))]


def showcase_files(run_folder: Path, last_stage: int) -> list[tuple[Path, str]]:
    """List the shown files of stages from the first to the given one with their paths on the run page."""
    return [file for number in range(FIRST_STAGE_NUMBER, last_stage + 1)
            for file in _stage_files(run_folder, number)]


def stage_pages(number: int, published_paths: set[str]) -> list[str]:
    """Return the published HTML pages of one stage outside its visuals folders, in path order."""
    stage_name = STAGE_FOLDER_TEMPLATE.format(number=number)
    pages = [PurePosixPath(path) for path in published_paths if path.endswith(PAGE_FILE_SUFFIX)]
    return sorted(str(page) for page in pages if page.parts[0] == stage_name and VISUALS_FOLDER_NAME not in page.parts)


def _stage_section(number: int, published_paths: set[str], title: str) -> run_page_publishing.IndexSection:
    """Build the index section of one stage: a clean-view link to every page, labelled with its path in the stage."""
    stage_name = STAGE_FOLDER_TEMPLATE.format(number=number)
    links = tuple((page.removeprefix(f"{stage_name}/"), f"{page}{CLEAN_VIEW_QUERY}")
                  for page in stage_pages(number, published_paths))
    return run_page_publishing.IndexSection(anchor=stage_name, title=title, links=links)


def index_page(product_name: str, published_paths: set[str],
               stage_titles: dict[int, str] = VERSION_5_STAGE_TITLES) -> str:
    """Build the run page index with a section for every published stage that has pages."""
    numbers = [number for number in stage_titles if stage_pages(number, published_paths)]
    sections = [_stage_section(number, published_paths, stage_titles[number]) for number in numbers]
    return run_page_publishing.index_page(product_name, sections)


def publish_landing_run_page(run_folder: Path, product_name: str, stage: int, page_url: str,
                             stage_titles: dict[int, str] = VERSION_5_STAGE_TITLES) -> None:
    """Upload stages up to the shown one, save the page address and check the index and the stage pages."""
    files = showcase_files(run_folder, stage)
    published_paths = {path for _, path in files}
    pages = stage_pages(stage, published_paths)
    if not pages:
        stage_name = STAGE_FOLDER_TEMPLATE.format(number=stage)
        raise ValueError(f"в папке запуска нет страниц этапа {stage}: {stage_name}/*{PAGE_FILE_SUFFIX}")
    index_html = index_page(product_name, published_paths, stage_titles)
    run_page_publishing.publish_run_page(run_folder, page_url, files, index_html, pages)


def _parse_arguments() -> argparse.Namespace:
    """Read the run folder, the product name, the stage being shown and the pipeline naming the stages."""
    parser = argparse.ArgumentParser(
        description="Выложить готовые этапы запуска лендинга на страницу запуска my.holdi.ai.")
    parser.add_argument("--run-folder", type=Path, required=True, help="папка запуска dev/pipeline-workspace/<…>")
    parser.add_argument("--product-name", required=True, help="название продукта для заголовка страницы")
    parser.add_argument("--stage", type=int, choices=ALL_STAGE_NUMBERS, required=True,
                        help="номер показываемого этапа; выкладываются этапы с 0-го по него")
    parser.add_argument("--pipeline", choices=sorted(STAGE_TITLES_BY_PIPELINE), default=VERSION_5_PIPELINE,
                        help="чьи названия этапов показать: version-5 — версия 5 и лендинг по референсу в новом "
                             "стиле, visuals-before-layout — лендинг по референсу с визуалами до вёрстки")
    return parser.parse_args()


def _publish(arguments: argparse.Namespace) -> list[str]:
    """Publish the run page for the parsed arguments and return the page address and the stage link lines."""
    stage_titles = stage_titles_of_pipeline(arguments.pipeline, arguments.stage)
    run_folder = arguments.run_folder.resolve()
    if not run_folder.is_dir():
        raise ValueError(f"папки запуска нет: {run_folder}")
    page_url = run_page_publishing.stored_page_url(run_folder) or new_page_url(run_folder)
    publish_landing_run_page(run_folder, arguments.product_name, arguments.stage, page_url, stage_titles)
    stage_anchor = STAGE_FOLDER_TEMPLATE.format(number=arguments.stage)
    return [f"Страница запуска: {page_url}", f"{stage_titles[arguments.stage]}: {page_url}#{stage_anchor}"]


def main() -> int:
    """Publish the finished stages and print the run page address and the direct link of the shown stage."""
    arguments = _parse_arguments()
    return run_page_publishing.run_publication(lambda: _publish(arguments))


if __name__ == "__main__":
    sys.exit(main())
