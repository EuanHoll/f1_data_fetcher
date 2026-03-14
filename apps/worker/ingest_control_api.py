import os
import queue
import subprocess
import threading
import time
import uuid
from typing import Dict, List

from flask import Flask, jsonify, request


app = Flask(__name__)

job_queue: queue.Queue[Dict] = queue.Queue()
jobs: Dict[str, Dict] = {}
jobs_lock = threading.Lock()


def normalize_sessions(items) -> List[Dict]:
    if not isinstance(items, list):
        return []

    out = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            year = int(item.get("year"))
            round_number = int(item.get("round"))
            session_code = str(item.get("sessionCode", "")).upper().strip()
        except Exception:
            continue

        if not session_code:
            continue

        key = (year, round_number, session_code)
        if key in seen:
            continue
        seen.add(key)

        out.append(
            {
                "year": year,
                "round": round_number,
                "sessionCode": session_code,
            }
        )

    return out


def update_job(job_id: str, patch: Dict):
    with jobs_lock:
        current = jobs.get(job_id, {})
        current.update(patch)
        jobs[job_id] = current


def run_ingest_session(base_url: str, ingest_api_key: str, year: int, round_number: int, session_code: str):
    script_path = os.path.join(os.path.dirname(__file__), "ingest_fastf1_session.py")
    python_bin = os.environ.get("PYTHON_BIN", "python")
    cache_dir = os.environ.get("FASTF1_CACHE_DIR", "/data/fastf1-cache")

    os.makedirs(cache_dir, exist_ok=True)

    args = [
        python_bin,
        script_path,
        "--year",
        str(year),
        "--round",
        str(round_number),
        "--session",
        session_code,
        "--base-url",
        base_url,
        "--api-key",
        ingest_api_key,
        "--cache-dir",
        cache_dir,
    ]

    subprocess.run(args, check=True)


def worker_loop():
    while True:
        job = job_queue.get()
        if job is None:
            return

        job_id = job["jobId"]
        sessions = job["sessions"]
        base_url = job["baseUrl"]
        ingest_api_key = job["ingestApiKey"]

        update_job(
            job_id,
            {
                "status": "running",
                "startedAt": int(time.time() * 1000),
                "total": len(sessions),
                "completed": 0,
                "failed": 0,
            },
        )

        completed = 0
        failed = 0

        for item in sessions:
            try:
                run_ingest_session(base_url, ingest_api_key, item["year"], item["round"], item["sessionCode"])
                completed += 1
            except Exception as exc:
                failed += 1
                update_job(job_id, {"lastError": str(exc)})
            finally:
                update_job(job_id, {"completed": completed, "failed": failed})

        update_job(
            job_id,
            {
                "status": "failed" if failed > 0 else "succeeded",
                "completedAt": int(time.time() * 1000),
            },
        )


@app.get("/health")
def health():
    return jsonify({"ok": True, "queueSize": job_queue.qsize()})


@app.post("/jobs")
def create_job():
    required_key = os.environ.get("WORKER_API_KEY", "")
    if required_key:
        provided = request.headers.get("x-worker-key", "")
        if provided != required_key:
            return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    sessions = normalize_sessions(payload.get("sessions"))
    if not sessions:
        return jsonify({"error": "No valid sessions provided"}), 400

    base_url = str(payload.get("baseUrl") or os.environ.get("INGEST_BASE_URL") or "http://web:3000")
    ingest_api_key = str(payload.get("ingestApiKey") or os.environ.get("INGEST_API_KEY") or "")

    if not ingest_api_key:
        return jsonify({"error": "Missing ingest API key"}), 400

    job_id = str(uuid.uuid4())
    job = {
        "jobId": job_id,
        "status": "queued",
        "createdAt": int(time.time() * 1000),
        "baseUrl": base_url,
        "ingestApiKey": ingest_api_key,
        "sessions": sessions,
        "total": len(sessions),
        "completed": 0,
        "failed": 0,
    }

    update_job(job_id, job)
    job_queue.put(job)

    return jsonify({"ok": True, "jobId": job_id, "queued": len(sessions), "queueSize": job_queue.qsize()})


@app.get("/jobs/<job_id>")
def get_job(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Not found"}), 404
    safe = dict(job)
    safe.pop("ingestApiKey", None)
    return jsonify(safe)


if __name__ == "__main__":
    threading.Thread(target=worker_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=8080)
