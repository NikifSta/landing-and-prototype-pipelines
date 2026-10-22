#!/usr/bin/env python3
"""Сборка метапромптов. Python 3.8+, без API и генерации изображений."""

import argparse
import copy
import json
import math
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
MASTER = "02_Общий_промпт_раздела.md"
COMMON = "01_Общие_правила_метапромпта.md"
STANDALONE = "standalone_template.md"
COMMON_SLOT = "{ОБЩИЕ_ПРАВИЛА_МЕТАПРОМПТА}"
MODULES_SLOT = "{СУБПРОМПТЫ_ВИЗУАЛЬНЫХ_ЭЛЕМЕНТОВ}"
DEFAULT_IMAGE_PROMPT_LIMIT = 12000
REVIEW_MODEL = "gpt-6-astra"
REVIEW_REASONING_EFFORT = "xhigh"
REVIEW_THRESHOLD = 8
MAX_REVIEW_ATTEMPTS = 3
FIELDS = {
    "product": "{Название и описание}",
    "audience": "{Аудитория}",
    "advantages": "{Преимущества}",
    "price": "{Цена и условия}",
    "region": "{Регион предложения}",
    "cta": "{Что должен сделать посетитель лендинга}",
    "section": "{Назначение раздела, его главная мысль, место на странице и точные тексты: заголовок, описание, подписи и кнопки.}",
    "references": "{Референсы: вложения, соответствующие области и переносимые приёмы}",
    "elements": "{Элементы: категория, количество, роль и ссылка на область референса; без готовых сюжетов}",
    "identity": "{Фирменный стиль, логотип, шрифты, фотографии, существующий интерфейс и другие исходные материалы.}",
    "existing_sections": "{Изображения готовых разделов в порядке следования. Указать, после какого раздела размещается новый. Если готовых частей нет — «нет».}",
    "format": "{Десктоп или мобильный, ширина и высота изображения либо соотношение сторон, язык.}",
}


def normalize(value):
    return re.sub(r"\s*/\s*", "/", " ".join(value.casefold().replace("ё", "е").split()))


def read_text(path):
    value = Path(path).read_text(encoding="utf-8-sig")
    if not value.strip():
        raise ValueError("Пустой файл: " + str(path))
    return value


def read_catalog(path):
    catalog = json.loads(read_text(path))
    if not isinstance(catalog, dict) or not catalog:
        raise ValueError("Каталог должен быть непустым JSON-объектом.")
    lookup = {}
    for name, item in catalog.items():
        if not name.strip() or not isinstance(item, dict):
            raise ValueError("Неверная запись каталога: " + name)
        if not isinstance(item.get("file"), str) or not item["file"].strip():
            raise ValueError("Не указан файл категории: " + name)
        aliases = item.get("aliases", [])
        if not isinstance(aliases, list) or not all(isinstance(a, str) and a.strip() for a in aliases):
            raise ValueError("Неверные aliases категории: " + name)
        for alias in [name] + aliases:
            key = normalize(alias)
            if key in lookup and lookup[key] != name:
                raise ValueError("Одинаковое имя у разных категорий: " + alias)
            lookup[key] = name
    return catalog, lookup


def select_categories(categories, catalog, lookup):
    if isinstance(categories, str):
        categories = [categories]
    if not isinstance(categories, (list, tuple)) or not all(isinstance(c, str) for c in categories):
        raise ValueError("categories: нужна строка или список строк.")
    requested = [c.strip() for group in categories for c in re.split(r"[;\n]+", group) if c.strip()]
    if not requested:
        raise ValueError("Укажите хотя бы одну визуальную категорию.")
    unknown = [c for c in requested if normalize(c) not in lookup]
    if unknown:
        raise ValueError("Нет субпромпта для: " + "; ".join(unknown) + ". Доступны: " + "; ".join(catalog))
    return list(dict.fromkeys(lookup[normalize(c)] for c in requested))


def build_prompt(categories, inputs=None, prompts_dir=BASE, catalog_path=None,
                 standalone=False, require_complete=False):
    """Вернуть метапромпт. Выбор идей выполнит текстовая модель, не этот скрипт."""
    prompts_dir = Path(prompts_dir)
    catalog, lookup = read_catalog(catalog_path or prompts_dir / "categories.json")
    selected = select_categories(categories, catalog, lookup)
    if standalone and len(selected) != 1:
        raise ValueError("Автономная версия требует ровно одну категорию.")
    inputs = {} if inputs is None else inputs
    if not isinstance(inputs, dict) or not all(isinstance(v, str) for v in inputs.values()):
        raise ValueError("Вводные должны быть JSON-объектом со строковыми значениями.")

    template = read_text(prompts_dir / (STANDALONE if standalone else MASTER))
    used = {key: slot for key, slot in FIELDS.items() if slot in template}
    extra = set(inputs) - set(used)
    if extra:
        raise ValueError("Неизвестные или неприменимые поля: " + ", ".join(sorted(extra)))
    for slot in [COMMON_SLOT, MODULES_SLOT] + list(used.values()):
        if template.count(slot) != 1:
            raise ValueError("Поле должно встречаться ровно один раз: " + slot)
    if not standalone and "elements" not in used:
        raise ValueError("В мастере отсутствует поле elements.")
    if standalone and template.count("{КАТЕГОРИЯ}") != 1:
        raise ValueError("В автономном шаблоне отсутствует единственное поле категории.")
    if require_complete:
        missing = [key for key in used if not inputs.get(key, "").strip() or inputs.get(key) == used[key]]
        if missing:
            raise ValueError("Не заполнены поля: " + ", ".join(missing))

    modules, seen = [], set()
    for category in selected:
        path = (prompts_dir / catalog[category]["file"]).resolve()
        if path not in seen:
            modules.append(read_text(path).strip())
            seen.add(path)
    replacements = {
        COMMON_SLOT: read_text(prompts_dir / COMMON).strip(),
        MODULES_SLOT: "\n\n".join(modules),
    }
    replacements.update({used[key]: value for key, value in inputs.items()})
    if standalone:
        replacements["{КАТЕГОРИЯ}"] = selected[0]
    else:
        replacements[FIELDS["elements"]] = (
            "Категории: " + "; ".join(selected) + ".\n"
            + inputs.get("elements", FIELDS["elements"])
        )
    # Один проход: скобки во вводных и вставленных модулях не интерпретируются.
    pattern = re.compile("|".join(re.escape(key) for key in replacements))
    return pattern.sub(lambda match: replacements[match.group(0)], template)


def protected_paths(prompts_dir, catalog_path):
    catalog, _ = read_catalog(catalog_path)
    paths = [prompts_dir / name for name in (MASTER, COMMON, STANDALONE)]
    paths += [Path(__file__), Path(catalog_path)]
    paths += [prompts_dir / item["file"] for item in catalog.values()]
    return {p.resolve() for p in paths}


def sync_standalone(prompts_dir=BASE, catalog_path=None):
    """Механически обновить автономные версии из общих правил и модулей."""
    prompts_dir = Path(prompts_dir)
    catalog_path = catalog_path or prompts_dir / "categories.json"
    catalog, _ = read_catalog(catalog_path)
    protected = protected_paths(prompts_dir, catalog_path)
    jobs, targets = [], set()
    for category, item in catalog.items():
        name = item.get("standalone_file")
        if not name:
            continue
        if not isinstance(name, str) or Path(name).name != name:
            raise ValueError("standalone_file должен быть именем файла без папок.")
        target = (prompts_dir / name).resolve()
        if target in protected or target in targets:
            raise ValueError("Конфликт выходного файла: " + name)
        value = build_prompt([category], prompts_dir=prompts_dir,
                             catalog_path=catalog_path, standalone=True)
        jobs.append((target, value))
        targets.add(target)
    # Сначала проверены все входы, только затем запись.
    for target, value in jobs:
        target.write_text(value, encoding="utf-8")
    return [target for target, _ in jobs]


def check_image_prompt(path, max_chars=DEFAULT_IMAGE_PROMPT_LIMIT):
    """Только проверка длины готового промпта, без обрезки и без генерации."""
    if max_chars <= 0:
        raise ValueError("Лимит должен быть положительным.")
    value = read_text(path)
    length = len(value)
    if length > max_chars:
        raise ValueError("Готовый промпт: %d символов, лимит %d. Файл не изменён." % (length, max_chars))
    return length


def score_review(report, expected_targets):
    """Проверить реальное ревью и вычислить оценку без усреднения слабых мест."""
    if not isinstance(report, dict) or not expected_targets:
        raise ValueError("Нужны результат ревью и фиксированный список объектов оценки.")
    ratings = report.get("ratings")
    checks = report.get("checks")
    if not isinstance(ratings, list) or not ratings or not isinstance(checks, list) or not checks:
        raise ValueError("Ревью должно содержать ratings и заполненный checks.")
    scores = {}
    for item in ratings:
        if not isinstance(item, dict):
            raise ValueError("Неверная строка ratings.")
        target, score = item.get("target"), item.get("score")
        if not isinstance(target, str) or not target.strip() or target in scores:
            raise ValueError("Пустой или повторяющийся target в ratings.")
        if (isinstance(score, bool) or not isinstance(score, (int, float))
                or not math.isfinite(score) or not 0 <= score <= 10):
            raise ValueError("Оценка должна быть конечным числом от 0 до 10.")
        scores[target] = score
    missing = set(expected_targets) - set(scores)
    if missing:
        raise ValueError("Пропущены обязательные оценки: " + ", ".join(sorted(missing)))
    failed = False
    for check in checks:
        if not isinstance(check, dict) or check.get("status") not in {"pass", "fail", "not_applicable"}:
            raise ValueError("Неверный пункт checks.")
        for key in ("target", "requirement", "evidence"):
            if not isinstance(check.get(key), str) or not check[key].strip():
                raise ValueError("Пункт checks требует target, requirement и evidence.")
        failed = failed or check["status"] == "fail"
    score = min(scores.values())
    return min(score, 7) if failed else score


def run_review_loop(initial_prompt, review, revise, expected_targets):
    """Выполнить до 3 реальных ревью через переданные функции интеграции.

    review создаёт нового субагента с указанной моделью, передаёт ему неизменные
    вводные/вложения/чек-лист и возвращает JSON ревью. revise исправляет текст.
    CLI сборщика сам не имеет доступа к моделям; эти функции даёт среда запуска.
    """
    targets = tuple(expected_targets)
    if not targets:
        raise ValueError("Задайте объекты оценки из согласованного разбора.")
    candidate, history = initial_prompt, []
    for iteration in range(1, MAX_REVIEW_ATTEMPTS + 1):
        if not isinstance(candidate, str) or not candidate.strip():
            raise ValueError("Пустой промпт для ревью.")
        report = review(candidate, model=REVIEW_MODEL,
                        reasoning_effort=REVIEW_REASONING_EFFORT)
        score = score_review(report, targets)
        history.append({"iteration": iteration, "prompt": candidate,
                        "score": score, "review": copy.deepcopy(report)})
        if score >= REVIEW_THRESHOLD or iteration == MAX_REVIEW_ATTEMPTS:
            break
        candidate = revise(candidate, copy.deepcopy(report))
    best = max(history, key=lambda item: (item["score"], item["iteration"]))
    return {"prompt": best["prompt"], "score": best["score"],
            "iteration": best["iteration"], "passed": best["score"] >= REVIEW_THRESHOLD,
            "history": history}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("categories", nargs="*")
    parser.add_argument("--input", type=Path, help="JSON: categories и вводные.")
    parser.add_argument("--output", "-o", type=Path)
    parser.add_argument("--prompts-dir", type=Path, default=BASE)
    parser.add_argument("--catalog", type=Path)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--list", action="store_true")
    modes.add_argument("--standalone", action="store_true")
    modes.add_argument("--sync-standalone", action="store_true")
    modes.add_argument("--check-image-prompt", type=Path)
    parser.add_argument("--max-chars", type=int, default=DEFAULT_IMAGE_PROMPT_LIMIT)
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    try:
        catalog_path = args.catalog or args.prompts_dir / "categories.json"
        if args.list or args.sync_standalone or args.check_image_prompt:
            if args.categories or args.input or args.output:
                raise ValueError("Этот режим не принимает категории, --input и --output.")
            if args.list:
                print("\n".join(read_catalog(catalog_path)[0]))
            elif args.sync_standalone:
                for path in sync_standalone(args.prompts_dir, catalog_path):
                    print(path.name)
            else:
                length = check_image_prompt(args.check_image_prompt, args.max_chars)
                print("Промпт: %d символов; лимит: %d. Генерация не выполнялась." % (length, args.max_chars))
            return
        inputs = json.loads(read_text(args.input)) if args.input else {}
        if not isinstance(inputs, dict):
            raise ValueError("Файл вводных должен содержать JSON-объект.")
        from_input = inputs.pop("categories", [])
        if args.categories and from_input:
            raise ValueError("Задайте категории либо аргументами, либо в JSON.")
        value = build_prompt(args.categories or from_input, inputs, args.prompts_dir,
                             catalog_path, args.standalone, args.require_complete)
        if args.output:
            protected = protected_paths(args.prompts_dir, catalog_path)
            catalog, _ = read_catalog(catalog_path)
            protected.update((args.prompts_dir / item["standalone_file"]).resolve()
                             for item in catalog.values() if item.get("standalone_file"))
            if args.input:
                protected.add(args.input.resolve())
            if args.output.resolve() in protected:
                raise ValueError("Выходной файл совпадает с исходным. Используйте --sync-standalone для автономных версий.")
            args.output.write_text(value, encoding="utf-8")
            print("Метапромпт: %d символов. Это вход для текстовой модели." % len(value), file=sys.stderr)
        else:
            sys.stdout.write(value)
    except (OSError, ValueError) as exc:
        parser.exit(2, "Ошибка: " + str(exc) + "\n")


if __name__ == "__main__":
    main()
