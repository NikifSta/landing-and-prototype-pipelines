"""Merge the stage-12 demo dataset skeleton with parallel-generated parts into one DEMO_DATASET.json.

The output file is written only when the merge is clean: no conflicting field values,
no repeated record IDs across entities and no references to missing records.

  /home/ivan/claude-sandbox/hypothesis-tester/.venv/bin/python demo_dataset_parts_merger.py \
    --skeleton product/dataset-parts/skeleton.json --parts product/dataset-parts/part-*.json \
    --output product/DEMO_DATASET.json
"""
import argparse
import copy
import json
import re
import sys
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

type JsonValue = None | bool | int | float | str | list[JsonValue] | dict[str, JsonValue]
type JsonObject = dict[str, JsonValue]

EXIT_MERGE_PROBLEMS = 1
EXIT_INPUT_ERROR = 2
RECORDS_KEY = 'records'
RECORD_ID_KEY = 'id'
SKELETON_SOURCE_NAME = 'skeleton'
# Соглашение этапа 12: одна ссылка — поле `<имя>_ref`, список ссылок — `<имя>_refs`.
SINGLE_REFERENCE_SUFFIX = '_ref'
REFERENCE_LIST_SUFFIX = '_refs'
# ID документов пайплайна (F-06, ST-…, SCR-01, AREA-…) заглавные и указывают не на записи набора.
PIPELINE_DOCUMENT_ID_PATTERN = re.compile(r'^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$')
FIXTURE_COLLECTION_KEYS = ('scenario_fixtures', 'state_fixtures', 'screen_fixtures')
OUTPUT_JSON_INDENT = 2


class InputFileError(Exception):
    """An input file is missing, unreadable or not a JSON object."""


@dataclass
class IndexedRecord:
    entity_id: str
    record: JsonObject
    sources: list[str] = field(default_factory=list)


@dataclass
class MergeOutcome:
    dataset: JsonObject
    problems: list[str]


def merge_dataset_parts(skeleton: JsonObject, named_parts: dict[str, JsonObject]) -> MergeOutcome:
    """Merge part records into a copy of the skeleton and list every conflict and broken reference."""
    dataset = copy.deepcopy(skeleton)
    problems: list[str] = []
    index = _index_skeleton_records(dataset, problems)
    for part_name, part in named_parts.items():
        for entity_id, record in _iterate_part_records(part):
            _merge_part_record(dataset, index, entity_id, copy.deepcopy(record), part_name, problems)
    problems.extend(_find_broken_references(dataset, index))
    return MergeOutcome(dataset, problems)


def validate_part(part_name: str, part: JsonValue) -> list[str]:
    """Return the shape problems of one part: only `records` by E-ID, every record an object with a string `id`."""
    if not isinstance(part, dict) or not isinstance(part.get(RECORDS_KEY), dict):
        return [f'{part_name}: нужен объект с полем `{RECORDS_KEY}` — словарём записей по E-ID']
    extra_key_problems = [f'{part_name}: лишнее поле `{key}` — часть содержит только `{RECORDS_KEY}`'
                          for key in part if key != RECORDS_KEY]
    return extra_key_problems + _record_collection_problems(part_name, part[RECORDS_KEY])


def _record_collection_problems(source_name: str, records_by_entity: JsonObject) -> list[str]:
    return [f'{source_name}: {entity_id} — нужен список записей, у каждой строковый `{RECORD_ID_KEY}`'
            for entity_id, records in records_by_entity.items()
            if not isinstance(records, list) or not all(_has_string_id(record) for record in records)]


def _has_string_id(record: JsonValue) -> bool:
    return isinstance(record, dict) and isinstance(record.get(RECORD_ID_KEY), str)


def _iterate_part_records(part: JsonObject) -> Iterator[tuple[str, JsonObject]]:
    for entity_id, records in part[RECORDS_KEY].items():
        yield from ((entity_id, record) for record in records)


def _index_skeleton_records(dataset: JsonObject, problems: list[str]) -> dict[str, IndexedRecord]:
    index: dict[str, IndexedRecord] = {}
    for entity_id, record in _iterate_part_records(dataset):
        record_id = record[RECORD_ID_KEY]
        if record_id in index:
            problems.append(_repeated_id_problem(SKELETON_SOURCE_NAME, record_id, entity_id, index[record_id]))
            continue
        index[record_id] = IndexedRecord(entity_id, record, [SKELETON_SOURCE_NAME])
    return index


def _repeated_id_problem(source_name: str, record_id: str, entity_id: str, existing: IndexedRecord) -> str:
    return (f'{source_name}: ID {record_id} в {entity_id} уже занят записью {existing.entity_id} '
            f'(источники: {", ".join(existing.sources)})')


def _merge_part_record(dataset: JsonObject, index: dict[str, IndexedRecord], entity_id: str,
                       record: JsonObject, part_name: str, problems: list[str]) -> None:
    record_id = record[RECORD_ID_KEY]
    existing = index.get(record_id)
    if existing is None:
        dataset[RECORDS_KEY].setdefault(entity_id, []).append(record)
        index[record_id] = IndexedRecord(entity_id, record, [part_name])
    elif existing.entity_id != entity_id:
        problems.append(_repeated_id_problem(part_name, record_id, entity_id, existing))
    else:
        _merge_record_fields(existing, record, part_name, problems)


def _merge_record_fields(existing: IndexedRecord, addition: JsonObject, part_name: str,
                         problems: list[str]) -> None:
    for field_name, value in addition.items():
        current = existing.record.get(field_name)
        if field_name not in existing.record or current == value:
            existing.record[field_name] = value
        elif _is_reference_list_pair(field_name, current, value):
            existing.record[field_name] = _unite_preserving_order(current, value)
        else:
            problems.append(f'{part_name}: запись {addition[RECORD_ID_KEY]}, поле {field_name}: значение '
                            f'расходится с источниками {", ".join(existing.sources)}')
    existing.sources.append(part_name)


def _is_reference_list_pair(field_name: str, current: JsonValue, value: JsonValue) -> bool:
    return field_name.endswith(REFERENCE_LIST_SUFFIX) and isinstance(current, list) and isinstance(value, list)


def _unite_preserving_order(first: list[JsonValue], second: list[JsonValue]) -> list[JsonValue]:
    united = list(first)
    united.extend(item for item in second if item not in first)
    return united


def _find_broken_references(dataset: JsonObject, index: dict[str, IndexedRecord]) -> list[str]:
    fixtures = [fixture for key in FIXTURE_COLLECTION_KEYS for fixture in dataset.get(key, [])]
    known_ids = set(index) | {fixture.get(RECORD_ID_KEY) for fixture in fixtures}
    owners = [(indexed.record, ', '.join(indexed.sources)) for indexed in index.values()]
    owners += [(fixture, 'fixtures') for fixture in fixtures]
    return [f'{sources}: запись {owner.get(RECORD_ID_KEY)}, поле {field_name}: нет записи {target}'
            for owner, sources in owners
            for field_name, target in _iterate_references(owner)
            if target not in known_ids and not PIPELINE_DOCUMENT_ID_PATTERN.match(target)]


def _iterate_references(node: JsonValue) -> Iterator[tuple[str, str]]:
    """Yield (field name, referenced ID) for every `*_ref` / `*_refs` value inside a JSON node."""
    if isinstance(node, list):
        for item in node:
            yield from _iterate_references(item)
    elif isinstance(node, dict):
        for field_name, value in node.items():
            yield from _references_of_field(field_name, value)
            yield from _iterate_references(value)


def _references_of_field(field_name: str, value: JsonValue) -> Iterator[tuple[str, str]]:
    if field_name.endswith(SINGLE_REFERENCE_SUFFIX) and isinstance(value, str):
        yield field_name, value
    elif field_name.endswith(REFERENCE_LIST_SUFFIX) and isinstance(value, list):
        yield from ((field_name, item) for item in value if isinstance(item, str))


def _load_json_object(path: Path) -> JsonObject:
    try:
        content = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        raise InputFileError(f'{path}: не читается как JSON — {error}') from error
    if not isinstance(content, dict):
        raise InputFileError(f'{path}: нужен JSON-объект')
    return content


def _parse_arguments(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Склейка каркаса и частей данных этапа 12 в DEMO_DATASET.json.')
    parser.add_argument('--skeleton', type=Path, required=True, help='product/dataset-parts/skeleton.json')
    parser.add_argument('--parts', type=Path, nargs='+', required=True, help='product/dataset-parts/part-*.json')
    parser.add_argument('--output', type=Path, required=True, help='product/DEMO_DATASET.json')
    return parser.parse_args(argv)


def _load_inputs(arguments: argparse.Namespace) -> tuple[JsonObject, dict[str, JsonObject]]:
    skeleton = _load_json_object(arguments.skeleton)
    if not isinstance(skeleton.get(RECORDS_KEY), dict):
        raise InputFileError(f'{arguments.skeleton}: нет поля `{RECORDS_KEY}` со словарём записей по E-ID')
    named_parts = {path.stem: _load_json_object(path) for path in arguments.parts}
    shape_problems = _record_collection_problems(SKELETON_SOURCE_NAME, skeleton[RECORDS_KEY])
    shape_problems += [problem for name, part in named_parts.items() for problem in validate_part(name, part)]
    if shape_problems:
        raise InputFileError('\n'.join(shape_problems))
    return skeleton, named_parts


def _write_dataset(dataset: JsonObject, output_path: Path) -> None:
    output_path.write_text(json.dumps(dataset, ensure_ascii=False, indent=OUTPUT_JSON_INDENT) + '\n',
                           encoding='utf-8')
    counts = ', '.join(f'{entity_id}: {len(records)}' for entity_id, records in dataset[RECORDS_KEY].items())
    print(f'{output_path} записан. Записей по E-ID — {counts}')


def main(argv: list[str]) -> int:
    """Merge the files named on the command line; exit 1 on merge problems, 2 on unreadable inputs."""
    arguments = _parse_arguments(argv)
    try:
        skeleton, named_parts = _load_inputs(arguments)
    except InputFileError as error:
        print(f'Входные файлы непригодны:\n{error}', file=sys.stderr)
        return EXIT_INPUT_ERROR
    outcome = merge_dataset_parts(skeleton, named_parts)
    if outcome.problems:
        print('\n'.join(outcome.problems), file=sys.stderr)
        print(f'{arguments.output} не записан: ошибок склейки — {len(outcome.problems)}', file=sys.stderr)
        return EXIT_MERGE_PROBLEMS
    _write_dataset(outcome.dataset, arguments.output)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
