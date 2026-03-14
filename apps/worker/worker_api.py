import os
import time
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from redis import Redis
from rq import Queue
from rq.job import Job
from rq.exceptions import NoSuchJobError
from rq.registry import FailedJobRegistry, FinishedJobRegistry, StartedJobRegistry


app = FastAPI(title="F1 Ingest Worker", version="1.0.0")


class SessionRef(BaseModel):
    year: int
    round: int
    sessionCode: str = Field(min_length=1)


class CreateIngestJobPayload(BaseModel):
    baseUrl: str
    ingestApiKey: str = Field(min_length=1)
    sessions: list[SessionRef]
    batchSize: int = Field(default=500, ge=1, le=5000)


class JobSummary(BaseModel):
    id: str
    status: Literal["queued", "running", "succeeded", "failed"]
    createdAt: int | None = None
    startedAt: int | None = None
    completedAt: int | None = None
    total: int = 0
    completed: int = 0
    failed: int = 0
    queuePosition: int | None = None
    lastError: str | None = None
    results: list[dict] = Field(default_factory=list)


def get_valkey_connection():
    return Redis.from_url(os.environ.get("VALKEY_URL", "redis://127.0.0.1:6379/0"))


def get_queue():
    return Queue(os.environ.get("RQ_QUEUE_NAME", "ingest"), connection=get_valkey_connection(), default_timeout=60 * 60 * 4)


def require_worker_key(worker_key: str | None):
    required_key = os.environ.get("WORKER_API_KEY", "")
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


def serialize_job(job: Job, queue: Queue):
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


@app.get("/health")
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


@app.post("/jobs")
def create_job(payload: CreateIngestJobPayload, x_worker_key: str | None = Header(default=None)):
    require_worker_key(x_worker_key)

    sessions = normalize_sessions(payload.sessions)
    if not sessions:
        raise HTTPException(status_code=400, detail="No valid sessions provided")

    queue = get_queue()
    job = queue.enqueue(
        "worker_tasks.process_ingest_job",
        {
            "baseUrl": payload.baseUrl,
            "ingestApiKey": payload.ingestApiKey,
            "sessions": sessions,
            "batchSize": payload.batchSize,
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
            "createdAt": int(time.time() * 1000),
            "queuePosition": queue.count,
            "sessions": sessions,
            "requestedSessionsJson": __import__("json").dumps(sessions),
            "results": [],
        }
    )
    job.save_meta()

    return {
        "ok": True,
        "jobId": job.id,
        "queued": len(sessions),
        "queueSize": queue.count,
    }


@app.get("/jobs/{job_id}")
def get_job(job_id: str, x_worker_key: str | None = Header(default=None)):
    require_worker_key(x_worker_key)

    queue = get_queue()
    try:
        job = Job.fetch(job_id, connection=queue.connection)
    except NoSuchJobError as exc:
        raise HTTPException(status_code=404, detail="Job not found") from exc
    return serialize_job(job, queue)
