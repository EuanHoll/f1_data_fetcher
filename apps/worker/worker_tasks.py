import os
import time

import requests
from rq import get_current_job

from fastf1_service import ingest_fastf1_session


def _set_job_meta(**values):
    job = get_current_job()
    if not job:
        return None
    job.meta.update(values)
    job.save_meta()
    return job


def _post_job_update(payload: dict):
    base_url = _resolve_base_url(payload)
    api_key = str(payload["ingestApiKey"])
    job = get_current_job()
    if not job:
        return

    meta = job.meta or {}
    response = requests.post(
        f"{base_url}/api/ingest/worker-job",
        json={
            "jobId": job.id,
            "status": meta.get("status", "queued"),
            "createdAt": meta.get("createdAt"),
            "startedAt": meta.get("startedAt"),
            "completedAt": meta.get("completedAt"),
            "total": meta.get("total", 0),
            "completed": meta.get("completed", 0),
            "failed": meta.get("failed", 0),
            "queuePosition": meta.get("queuePosition"),
            "lastError": meta.get("lastError"),
            "requestedSessionsJson": meta.get("requestedSessionsJson"),
            "resultsJson": json_dumps(meta.get("results", [])),
        },
        headers={"x-ingest-key": api_key, "content-type": "application/json"},
        timeout=60,
    )
    response.raise_for_status()


def json_dumps(value):
    import json

    return json.dumps(value)


def _resolve_base_url(payload: dict):
    base_url = str(os.environ.get("INGEST_BASE_URL") or payload.get("baseUrl") or "http://web:3000").rstrip("/")
    if "localhost" in base_url or "127.0.0.1" in base_url:
        return "http://web:3000"
    return base_url


def process_ingest_job(payload: dict):
    sessions = payload["sessions"]
    batch_size = int(payload.get("batchSize") or 500)
    cache_dir = payload.get("cacheDir") or os.environ.get("FASTF1_CACHE_DIR", "/data/fastf1-cache")
    base_url = _resolve_base_url(payload)

    _set_job_meta(
        status="running",
        jobType="session_ingest",
        baseUrl=base_url,
        createdAt=int(payload.get("createdAt") or int(time.time() * 1000)),
        total=len(sessions),
        completed=0,
        failed=0,
        queuePosition=payload.get("queuePosition"),
        startedAt=int(time.time() * 1000),
        sessions=sessions,
        requestedSessionsJson=json_dumps(sessions),
        lastError=None,
        results=[],
    )
    _post_job_update(payload)

    completed = 0
    failed = 0
    results = []

    for item in sessions:
        try:
            result = ingest_fastf1_session(
                base_url=base_url,
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
            _post_job_update(payload)
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
            _post_job_update(payload)

    completed_at = int(time.time() * 1000)
    if failed > 0:
        _set_job_meta(status="failed", completedAt=completed_at, completed=completed, failed=failed, results=results)
        _post_job_update(payload)
        raise RuntimeError(f"{failed} session(s) failed in worker job")

    _set_job_meta(status="succeeded", completedAt=completed_at, completed=completed, failed=failed, results=results)
    _post_job_update(payload)
    return {
        "ok": True,
        "completed": completed,
        "failed": failed,
        "results": results,
    }
