"""Regression tests for safe CSV CLI behavior (standard library unittest)."""

from __future__ import annotations

import contextlib
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "pandas_clean.py"


class CsvCleanerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.input = self.root / "input.csv"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_missing_file_has_nonzero_exit_and_sanitized_stderr(self) -> None:
        result = self.run_cli("--input", str(self.root / "private-canary.csv"))
        self.assertEqual(result.returncode, 2)
        self.assertIn("no se encontró", result.stderr)
        self.assertNotIn("private-canary", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_malformed_csv_has_nonzero_exit_without_traceback(self) -> None:
        self.input.write_text('"incomplete\nrow', encoding="utf-8")
        result = self.run_cli("--input", str(self.input))
        self.assertEqual(result.returncode, 1)
        self.assertIn("formato CSV válido", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertNotIn(str(self.input), result.stderr)

    def test_empty_csv_is_rejected_before_processing(self) -> None:
        self.input.write_text("", encoding="utf-8")
        result = self.run_cli("--input", str(self.input))
        self.assertEqual(result.returncode, 1)
        self.assertIn("vacío", result.stderr)

    def test_success_and_output_do_not_leak_cell_values(self) -> None:
        self.input.write_text("Full Name, Department\nCANARY_PERSONAL_DATA, HR\nCANARY_PERSONAL_DATA, HR\n", encoding="utf-8")
        output = self.root / "clean.csv"
        result = self.run_cli("--input", str(self.input), "--output", str(output))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("1 filas", result.stdout)
        self.assertNotIn("CANARY_PERSONAL_DATA", result.stdout)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(output.read_text(encoding="utf-8"), "full_name,department\nCANARY_PERSONAL_DATA, HR\n")

    def test_read_io_error_is_sanitized(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        spec = spec_from_file_location("pandas_clean", SCRIPT)
        assert spec and spec.loader
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        self.input.write_text("name\nvalue\n", encoding="utf-8")
        stderr = io.StringIO()
        with mock.patch.object(module.pd, "read_csv", side_effect=OSError("private filesystem detail CANARY")):
            with contextlib.redirect_stderr(stderr):
                exit_code = module.run(self.input)
        self.assertEqual(exit_code, 1)
        self.assertIn("No se pudo leer", stderr.getvalue())
        self.assertNotIn("CANARY", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())

    def test_failed_atomic_write_keeps_existing_target_unchanged(self) -> None:
        from importlib.util import module_from_spec, spec_from_file_location

        spec = spec_from_file_location("pandas_clean", SCRIPT)
        assert spec and spec.loader
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        self.input.write_text("name\nvalue\n", encoding="utf-8")
        output = self.root / "clean.csv"
        output.write_text("previous-complete-file\n", encoding="utf-8")
        stderr = io.StringIO()
        with mock.patch.object(module.os, "replace", side_effect=OSError("private filesystem detail")):
            with contextlib.redirect_stderr(stderr):
                exit_code = module.run(self.input, output)
        self.assertEqual(exit_code, 1)
        self.assertIn("ruta y los permisos", stderr.getvalue())
        self.assertNotIn("private filesystem detail", stderr.getvalue())
        self.assertEqual(output.read_text(encoding="utf-8"), "previous-complete-file\n")
        self.assertEqual(list(self.root.glob(".nexova-clean-*.tmp")), [])

    def test_input_and_output_must_not_be_same_file(self) -> None:
        self.input.write_text("name\nvalue\n", encoding="utf-8")
        original = self.input.read_text(encoding="utf-8")
        result = self.run_cli("--input", str(self.input), "--output", str(self.input))
        self.assertEqual(result.returncode, 1)
        self.assertIn("archivos distintos", result.stderr)
        self.assertEqual(self.input.read_text(encoding="utf-8"), original)

    def test_missing_output_parent_is_a_sanitized_failure(self) -> None:
        self.input.write_text("name\nvalue\n", encoding="utf-8")
        output = self.root / "private-directory" / "clean.csv"
        result = self.run_cli("--input", str(self.input), "--output", str(output))
        self.assertEqual(result.returncode, 1)
        self.assertIn("No se pudo guardar", result.stderr)
        self.assertNotIn("private-directory", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertFalse(output.exists())

    def test_output_directory_is_rejected(self) -> None:
        self.input.write_text("name\nvalue\n", encoding="utf-8")
        result = self.run_cli("--input", str(self.input), "--output", str(self.root))
        self.assertEqual(result.returncode, 2)
        self.assertIn("debe ser un archivo", result.stderr)


if __name__ == "__main__":
    unittest.main()
