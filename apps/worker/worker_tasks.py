import os
import time

from rq import get_current_job

from fastf1_service import ingest_fastf1_session


def _set_job_meta(**values):
    job = get_current_job()
    if not job:
        return None
    job.meta.update(values)
    job.save_meta()
    return job


def process_ingest_job(payload: dict):
    sessions = payload["sessions"]
    batch_size = int(payload.get("batchSize") or 500)
    cache_dir = payload.get("cacheDir") or os.environ.get("FASTF1_CACHE_DIR", "/data/fastf1-cache")

    _set_job_meta(
        status="running",
        jobType="session_ingest",
        baseUrl=payload["baseUrl"],
        total=len(sessions),
        completed=0,
        failed=0,
        startedAt=int(time.time() * 1000),
        sessions=sessions,
        lastError=None,
        results=[],
    )

    completed = 0
    failed = 0
    results = []

    for item in sessions:
        try:
            result = ingest_fastf1_session(
                base_url=payload["baseUrl"],
                api_key=payload["ingestApiKey"],
                year=int(item["year"]),
                round_number=int(item["round"]),
                session_code=str(item["sessionCode"]),
                batch_size=batch_size,
                cache_dir=cache_dir,
            )
            completed += 1
            results.append(
                {
                    "year": int(item["year"]),
                    "round": int(item["round"]),
                    "sessionCode": str(item["sessionCode"]),
                    "status": "succeeded",
                    "lapCount": result["lapCount"],
                }
            )
            _set_job_meta(completed=completed, failed=failed, results=results)
        except Exception as exc:
            failed += 1
            results.append(
                {
                    "year": int(item["year"]),
                    "round": int(item["round"]),
                    "sessionCode": str(item["sessionCode"]),
                    "status": "failed",
                    "error": str(exc),
                }
            )
            _set_job_meta(completed=completed, failed=failed, results=results, lastError=str(exc))

    completed_at = int(time.time() * 1000)
    if failed > 0:
        _set_job_meta(status="failed", completedAt=completed_at, completed=completed, failed=failed, results=results)
        raise RuntimeError(f"{failed} session(s) failed in worker job")

    _set_job_meta(status="succeeded", completedAt=completed_at, completed=completed, failed=failed, results=results)
    return {
        "ok": True,
        "completed": completed,
        "failed": failed,
        "results": results,
    }
