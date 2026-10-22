"""Проверки сборки: без API и генерации изображений."""
import itertools
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import build_prompt as b


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.catalog, self.lookup = b.read_catalog(b.BASE / "categories.json")

    def filled(self):
        return {key: "Данные: " + key for key in b.FIELDS}

    def test_all_nonempty_combinations(self):
        names = list(self.catalog)
        for count in range(1, len(names) + 1):
            for selected in itertools.combinations(names, count):
                with self.subTest(selected=selected):
                    text = b.build_prompt(selected, self.filled(), require_complete=True)
                    self.assertEqual(text.count("## Общие правила подготовки промпта"), 1)
                    for name, item in self.catalog.items():
                        module = b.read_text(b.BASE / item["file"]).strip()
                        self.assertEqual(text.count(module), int(name in selected))
                    for slot in b.FIELDS.values():
                        self.assertNotIn(slot, text)
                    self.assertNotIn(b.MODULES_SLOT, text)
                    self.assertNotIn(b.COMMON_SLOT, text)

    def test_all_aliases(self):
        for category, item in self.catalog.items():
            for alias in item["aliases"]:
                self.assertEqual(b.build_prompt(alias), b.build_prompt(category))

    def test_normalized_duplicates(self):
        self.assertEqual(
            b.build_prompt(["  ОБЩЕЕ ФОТО  ;фото", "photo"]),
            b.build_prompt("Общее фото"),
        )

    def test_unknown_category_does_not_guess(self):
        with self.assertRaises(ValueError):
            b.build_prompt("Видео с интерфейсом")

    def test_visual_density_contract_is_in_every_built_metaprompt(self):
        for category in self.catalog:
            with self.subTest(category=category):
                text = b.build_prompt(category)
                self.assertIn("### Контроль визуальной плотности", text)
                self.assertIn("Примени тест удаления", text)
                self.assertIn("один главный визуальный центр", text)
                self.assertIn("Свободное пространство считается полноценной частью композиции", text)

    def test_reference_mapping_selects_minimal_visual_set(self):
        text = b.read_text(b.BASE / "Промпт-сопоставления-элементов-лендинга.md")
        self.assertIn("не как список, который нужно перенести целиком", text)
        self.assertIn("минимальный достаточный набор категорий", text)
        self.assertIn("Для каждого объекта примени тест удаления", text)
        self.assertIn("Свободное пространство не требует заполнения", text)

    def test_empty_category_rejected(self):
        with self.assertRaises(ValueError):
            b.build_prompt([])

    def test_incomplete_template_is_allowed(self):
        text = b.build_prompt("фото")
        self.assertIn(b.FIELDS["product"], text)

    def test_strict_rejects_missing_and_blank_inputs(self):
        with self.assertRaises(ValueError):
            b.build_prompt("фото", require_complete=True)
        data = self.filled()
        data["product"] = " "
        with self.assertRaises(ValueError):
            b.build_prompt("фото", data, require_complete=True)

    def test_inputs_not_mutated(self):
        data = self.filled()
        original = dict(data)
        b.build_prompt("фото", data)
        self.assertEqual(data, original)

    def test_input_placeholders_are_literal(self):
        text = b.build_prompt("фото", {
            "product": "Не подставлять " + b.FIELDS["audience"],
            "audience": "Аудитория ABC",
        })
        self.assertIn("Не подставлять " + b.FIELDS["audience"], text)

    def test_unknown_input_rejected(self):
        with self.assertRaises(ValueError):
            b.build_prompt("фото", {"unexpected": "x"})

    def test_nonstring_input_rejected(self):
        with self.assertRaises(ValueError):
            b.build_prompt("фото", {"product": 42})

    def test_standalone_exactly_matches_sources(self):
        for category, item in self.catalog.items():
            with self.subTest(category=category):
                generated = b.build_prompt(category, standalone=True)
                self.assertEqual(generated, b.read_text(b.BASE / item["standalone_file"]))
                self.assertEqual(generated.count("## Общие правила подготовки промпта"), 1)
                self.assertIn(b.read_text(b.BASE / item["file"]).strip(), generated)
                self.assertNotIn("## Задача мастера", generated)

    def test_standalone_one_category(self):
        with self.assertRaises(ValueError):
            b.build_prompt(["фото", "иконки"], standalone=True)

    def test_standalone_complete(self):
        keys = ["product", "audience", "section", "references", "identity", "format"]
        text = b.build_prompt("фото", {key: "нет" for key in keys},
                              standalone=True, require_complete=True)
        for slot in b.FIELDS.values():
            self.assertNotIn(slot, text)

    def test_standalone_unused_inputs_are_not_silently_lost(self):
        with self.assertRaises(ValueError):
            b.build_prompt("фото", {"cta": "x"}, standalone=True)

    def test_character_count_not_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "prompt.md"
            path.write_text("Привет", encoding="utf-8")
            self.assertEqual(b.check_image_prompt(path, 6), 6)
            with self.assertRaises(ValueError):
                b.check_image_prompt(path, 5)
            self.assertEqual(path.read_text(encoding="utf-8"), "Привет")

    def test_limit_must_be_positive(self):
        with self.assertRaises(ValueError):
            b.check_image_prompt(b.BASE / b.MASTER, 0)

    def test_missing_module_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            for name in ["categories.json", b.MASTER, b.COMMON]:
                shutil.copy2(b.BASE / name, temp / name)
            with self.assertRaises(OSError):
                b.build_prompt("фото", prompts_dir=temp)

    def test_sync_preflight_protects_sources(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            for path in b.BASE.glob("*.md"):
                shutil.copy2(path, temp / path.name)
            catalog = json.loads(json.dumps(self.catalog))
            catalog["Общее фото"]["standalone_file"] = b.MASTER
            (temp / "categories.json").write_text(json.dumps(catalog), encoding="utf-8")
            before = (temp / b.MASTER).read_bytes()
            with self.assertRaises(ValueError):
                b.sync_standalone(temp)
            self.assertEqual(before, (temp / b.MASTER).read_bytes())

    def test_cli_refuses_source_overwrite(self):
        for name in [b.MASTER, b.COMMON, b.STANDALONE, "categories.json",
                     "Промпт_для_создания_отдельной_фотографии.md"]:
            path = b.BASE / name
            before = path.read_bytes()
            result = subprocess.run(
                [sys.executable, str(b.BASE / "build_prompt.py"), "фото", "-o", str(path)],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertEqual(before, path.read_bytes())

    def test_cli_from_other_directory_and_valid_output(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "meta.md"
            result = subprocess.run(
                [sys.executable, str(b.BASE / "build_prompt.py"), "фото", "-o", str(out)],
                cwd=temp, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(out.read_text(encoding="utf-8"), b.build_prompt("фото"))

    def test_large_inputs_are_not_truncated(self):
        value = "Я" * 33000
        self.assertIn(value, b.build_prompt("фото", {"product": value}))

    def test_holdi_metaprompt_matches_build(self):
        data = json.loads(b.read_text(b.BASE / "Holdi_request.json"))
        categories = data.pop("categories")
        actual = b.build_prompt(categories, data, require_complete=True)
        self.assertEqual(actual, b.read_text(b.BASE / "Holdi_metaprompt.md"))

    def test_holdi_exact_copy_preserved(self):
        data = json.loads(b.read_text(b.BASE / "Holdi_request.json"))
        output = b.read_text(b.BASE / "Holdi_generation_prompt.md")
        for line in data["section"].splitlines()[1:]:
            exact = line.split(": ", 1)[1]
            self.assertIn(exact, output)

    def test_holdi_output_ready_for_separate_generation(self):
        path = b.BASE / "Holdi_generation_prompt.md"
        self.assertLess(b.check_image_prompt(path), 12000)
        text = b.read_text(path)
        for stale in ["{СУБПРОМПТЫ", "Рассмотри три", "Сравни варианты", "03_Субпромпт"]:
            self.assertNotIn(stale, text)

    def test_no_legacy_direct_generation_in_sources(self):
        for name in [b.MASTER, b.COMMON] + [x["file"] for x in self.catalog.values()]:
            text = b.read_text(b.BASE / name)
            for stale in ["Выдай только одно готовое изображение",
                          "Сразу создай и покажи",
                          "Перед финальной генерацией"]:
                self.assertNotIn(stale, text)


class ReviewLoopTests(unittest.TestCase):
    def report(self, score, status="pass"):
        return {"ratings": [{"target": "Раздел", "score": score}],
                "checks": [{"target": "Раздел", "requirement": "Состав",
                            "status": status, "evidence": "Проверен состав кандидата"}],
                "fixes": []}

    def run_scores(self, scores):
        calls, revisions = [], []
        reports = iter(scores)
        def review(prompt, **config):
            calls.append((prompt, config))
            return self.report(next(reports))
        def revise(prompt, report):
            revisions.append(prompt)
            return prompt + "+"
        result = b.run_review_loop("v1", review, revise, ["Раздел"])
        return result, calls, revisions

    def test_stop_at_eight_and_exact_reviewer_configuration(self):
        result, calls, revisions = self.run_scores([8, 9])
        self.assertEqual(len(calls), 1)
        self.assertEqual(revisions, [])
        self.assertTrue(result["passed"])
        self.assertEqual(calls[0][1], {"model": "gpt-6-astra", "reasoning_effort": "xhigh"})

    def test_three_reviews_two_revisions_and_best_not_last(self):
        result, calls, revisions = self.run_scores([7.5, 6, 7])
        self.assertEqual((len(calls), len(revisions)), (3, 2))
        self.assertEqual(result["prompt"], "v1")
        self.assertEqual(result["iteration"], 1)
        self.assertFalse(result["passed"])

    def test_later_pass_stops_without_third_review(self):
        result, calls, revisions = self.run_scores([6, 8.5, 9])
        self.assertEqual((len(calls), len(revisions)), (2, 1))
        self.assertEqual(result["score"], 8.5)

    def test_equal_scores_choose_later_version(self):
        result, _, _ = self.run_scores([7, 6, 7])
        self.assertEqual(result["iteration"], 3)

    def test_required_failure_cannot_pass_with_high_ratings(self):
        self.assertEqual(b.score_review(self.report(9, "fail"), ["Раздел"]), 7)

    def test_missing_object_or_invalid_score_is_not_silently_accepted(self):
        with self.assertRaises(ValueError):
            b.score_review(self.report(9), ["Раздел", "Иллюстрация"])
        for score in [float("nan"), float("inf"), True, 11, -1]:
            with self.subTest(score=score), self.assertRaises(ValueError):
                b.score_review(self.report(score), ["Раздел"])

    def test_weakest_object_controls_score(self):
        report = self.report(9)
        report["ratings"].append({"target": "Фотография — оригинальность", "score": 6})
        self.assertEqual(b.score_review(report, ["Раздел", "Фотография — оригинальность"]), 6)

    def test_reviewer_error_does_not_fabricate_a_result(self):
        def unavailable(*args, **kwargs):
            raise RuntimeError("Reviewer unavailable")
        with self.assertRaises(RuntimeError):
            b.run_review_loop("prompt", unavailable, lambda p, r: p, ["Раздел"])


if __name__ == "__main__":
    unittest.main()
