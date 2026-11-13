"""Validate and summarize a CSV without printing its contents.

Run from the repository root, for example:
    python skills/data-analysis/scripts/pandas_clean.py --input data.csv

Optionally save the cleaned CSV with ``--output cleaned.csv``. The output is
replaced atomically only after the input has been read and processed.
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path
from typing import Sequence

try:
    import pandas as pd
except ImportError:  # Keep CLI able to report a friendly missing-dependency error.
    pd = None


class CsvProcessingError(Exception):
    """An expected failure with a deliberately sanitized user-facing message."""


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Valida y resume un archivo CSV.")
    parser.add_argument("--input", default="data.csv", help="Archivo CSV de entrada (por defecto: data.csv).")
    parser.add_argument("--output", help="Ruta opcional para guardar el CSV limpio.")
    return parser


def _read_csv(path: Path):
    if pd is None:
        raise CsvProcessingError("Falta una dependencia necesaria para procesar CSV.")
    try:
        frame = pd.read_csv(path, on_bad_lines="error")
    except pd.errors.EmptyDataError as exc:
        raise CsvProcessingError("El archivo CSV está vacío o no contiene encabezados.") from exc
    except pd.errors.ParserError as exc:
        raise CsvProcessingError("El archivo no tiene un formato CSV válido.") from exc
    except (OSError, UnicodeError) as exc:
        raise CsvProcessingError("No se pudo leer el archivo CSV. Verifica que sea accesible y esté codificado en UTF-8.") from exc

    if len(frame.columns) == 0:
        raise CsvProcessingError("El archivo CSV debe incluir al menos una columna.")
    return frame


def _write_csv_atomic(frame, output: Path) -> None:
    """Write beside the target and replace it only after a complete write."""
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="", suffix=".tmp",
            prefix=".nexova-clean-", dir=output.parent, delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)
            frame.to_csv(temp_file, index=False)
        os.replace(temp_path, output)
        temp_path = None
    except (OSError, UnicodeError) as exc:
        raise CsvProcessingError("No se pudo guardar el archivo de salida. Verifica la ruta y los permisos.") from exc
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass


def run(input_path: Path, output_path: Path | None = None) -> int:
    if not input_path.exists() or not input_path.is_file():
        print("Error: no se encontró un archivo CSV de entrada válido.", file=sys.stderr)
        return 2

    try:
        if output_path is not None and output_path.resolve() == input_path.resolve():
            raise CsvProcessingError("La entrada y la salida deben ser archivos distintos.")
        frame = _read_csv(input_path)
        frame = frame.dropna(axis=1, how="all")
        frame.columns = frame.columns.str.strip().str.lower().str.replace(" ", "_")
        duplicate_count = int(frame.duplicated().sum())
        frame = frame.drop_duplicates()
        if output_path is not None:
            _write_csv_atomic(frame, output_path)
    except CsvProcessingError as exc:
        # Print fixed sanitized messages, never raw exception/path details.
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"CSV procesado correctamente: {len(frame)} filas, {len(frame.columns)} columnas.")
    print(f"Filas duplicadas eliminadas: {duplicate_count}.")
    if output_path is not None:
        print("El archivo limpio se guardó correctamente.")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    output_path = Path(args.output) if args.output else None
    if output_path is not None and output_path.exists() and output_path.is_dir():
        print("Error: la ruta de salida debe ser un archivo.", file=sys.stderr)
        return 2
    return run(Path(args.input), output_path)


if __name__ == "__main__":
    raise SystemExit(main())
