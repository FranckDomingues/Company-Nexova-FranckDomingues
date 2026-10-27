"""Nexova incident analysis HTTP endpoint."""

import csv
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import APIRouter, File, HTTPException, UploadFile
from app.api.routes.incident_results import save_result

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])

ROOT = Path(__file__).resolve().parents[5]
ANALYZER_PATH = ROOT / "scripts" / "analyze.py"

spec = importlib.util.spec_from_file_location(
    "nexova_incident_analyzer", ANALYZER_PATH
)
if spec is None or spec.loader is None:
    raise RuntimeError("Incident analyzer unavailable")

analyzer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analyzer)

MAX_UPLOAD_BYTES = 100 * 1024 * 1024


@router.post("/analyze")
async def analyze_incidents(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="A CSV file is required",
        )

    try:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "incidents.csv"
            total_bytes = 0

            with path.open("wb") as output:
                while chunk := await file.read(1024 * 1024):
                    total_bytes += len(chunk)
                    if total_bytes > MAX_UPLOAD_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail="CSV file exceeds upload limit",
                        )
                    output.write(chunk)

            if total_bytes == 0:
                raise HTTPException(
                    status_code=400,
                    detail="CSV file is empty",
                )

            summary = analyzer.analyze(path)
            results = dict(analyzer.metrics(summary))

            analysis_id = save_result(results)

            return {
                "analysis_id": analysis_id,
                "total": summary["total"],
                "valid": summary["valid"],
                "invalid": summary["invalid"],
                "metrics": results,
            }

    except (ValueError, UnicodeError, csv.Error) as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid CSV structure or content",
        ) from exc
    finally:
        await file.close()


@router.get("/results/export")
def export_incident_results(analysis_id: str):
    """Export aggregate metrics for a specific analysis."""
    import io

    from fastapi.responses import StreamingResponse
    from app.api.routes.incident_results import get_result

    result = get_result(analysis_id)

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found",
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["metric", "value"])
    writer.writerows(result.items())
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="results.csv"'
        },
    )
