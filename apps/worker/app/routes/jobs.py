import json
import time

from fastapi import APIRouter, Header, HTTPException
from rq.exceptions import NoSuchJobError
from rq.job import Job
from rq.registry import FailedJobRegistry, FinishedJobRegistry, StartedJobRegistry

from app.config import get_worker_api_key
from app.models.jobs import CreateIngestJobPayload, JobSummary, SessionRef
from app.queue import get_queue


router = APIRouter()


def require_worker_key(worker_key: str | None):
    required_key = get_worker_api_key()
    if required_key and worker_key != required_key:
        raise HTTPException(status_code=401, detail="Unauthorized")


def normalize_sessions(items: list[SessionRef]):
    unique = {}
    for item in items:
        key = (int(item.year), int(item.round), str(item.sessionCode).upper().strip())
        if not key[2]:
            continue
        unique[f"{key[0]}-{key[1]}-{key[2]}"] = {
            "year": key[0],
            "round": key[1],
            "sessionCode": key[2],
        }
    return list(unique.values())


def serialize_job(job: Job, queue) -> JobSummary:
    job.refresh()
    meta = job.meta or {}

    status = "queued"
    rq_status = job.get_status(refresh=True)
    if rq_status in {"started", "deferred"}:
        status = "running"
    elif rq_status == "finished":
        status = "succeeded"
    elif rq_status == "failed":
        status = "failed"

    queue_position = None
    if status == "queued":
        try:
            queue_position = queue.job_ids.index(job.id) + 1
        except ValueError:
            queue_position = None

    created_at = int(job.created_at.timestamp() * 1000) if job.created_at else None

    return JobSummary(
        id=job.id,
        status=meta.get("status") or status,
        createdAt=created_at,
        startedAt=meta.get("startedAt"),
        completedAt=meta.get("completedAt"),
        total=int(meta.get("total") or len(meta.get("sessions") or [])),
        completed=int(meta.get("completed") or 0),
        failed=int(meta.get("failed") or 0),
        queuePosition=queue_position,
        lastError=meta.get("lastError"),
        results=list(meta.get("results") or []),
    )


@router.get("/health")
def health():
    queue = get_queue()
    return {
        "ok": True,
        "queue": queue.name,
        "queueSize": queue.count,
        "startedJobs": StartedJobRegistry(queue=queue).count,
        "failedJobs": FailedJobRegistry(queue=queue).count,
        "finishedJobs": FinishedJobRegistry(queue=queue).count,
        "timestamp": int(time.time() * 1000),
    }


@router.post("/jobs")
def create_job(payload: CreateIngestJobPayload, x_worker_key: str | None = Header(default=None)):
    require_worker_key(x_worker_key)

    sessions = normalize_sessions(payload.sessions)
    if not sessions:
        raise HTTPException(status_code=400, detail="No valid sessions provided")

    queue = get_queue()
    created_at = int(time.time() * 1000)
    queue_position = queue.count + 1
    job = queue.enqueue(
        "app.workers.tasks.process_ingest_job",
        {
            "baseUrl": payload.baseUrl,
            "ingestApiKey": payload.ingestApiKey,
            "sessions": sessions,
            "batchSize": payload.batchSize,
            "createdAt": created_at,
            "queuePosition": queue_position,
        },
        result_ttl=60 * 60 * 24,
        failure_ttl=60 * 60 * 24 * 7,
    )
    job.meta.update(
        {
            "status": "queued",
            "jobType": "session_ingest",
            "total": len(sessions),
            "completed": 0,
            "failed": 0,
            "createdAt": created_at,
            "queuePosition": queue_position,
            "sessions": sessions,
            "requestedSessionsJson": json.dumps(sessions),
            "results": [],
        }
    )
    job.save_meta()

    return {"ok": True, "jobId": job.id, "queued": len(sessions), "queueSize": queue.count}


@router.get("/jobs/{job_id}")
def get_job(job_id: str, x_worker_key: str | None = Header(default=None)):
    require_worker_key(x_worker_key)

    queue = get_queue()
    try:
        job = Job.fetch(job_id, connection=queue.connection)
    except NoSuchJobError as exc:
        raise HTTPException(status_code=404, detail="Job not found") from exc
    return serialize_job(job, queue)
