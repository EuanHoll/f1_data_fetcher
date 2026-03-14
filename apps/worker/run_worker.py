import os
import time

import requests
from redis import Redis
from rq import Queue, Worker
from rq.registry import StartedJobRegistry


def reconcile_worker_jobs(queue: Queue):
    base_url = str(os.environ.get("INGEST_BASE_URL") or "http://web:3000").rstrip("/")
    if "localhost" in base_url or "127.0.0.1" in base_url:
        base_url = "http://web:3000"

    api_key = os.environ.get("INGEST_API_KEY", "")
    if not api_key:
        return

    active_job_ids = list(queue.job_ids) + StartedJobRegistry(queue=queue).get_job_ids()
    last_error = None
    for _ in range(20):
        try:
            response = requests.post(
                f"{base_url}/api/ingest/worker-job/reconcile",
                json={
                    "activeJobIds": sorted(set(active_job_ids)),
                    "message": "Worker restarted and did not find this job in the live queue"
                },
                headers={"x-ingest-key": api_key, "content-type": "application/json"},
                timeout=30,
            )
            response.raise_for_status()
            return
        except requests.RequestException as exc:
            last_error = exc
            time.sleep(3)

    print(f"Worker job reconciliation skipped: {last_error}")


def main():
    queue_name = os.environ.get("RQ_QUEUE_NAME", "ingest")
    valkey_url = os.environ.get("VALKEY_URL", "redis://127.0.0.1:6379/0")
    connection = Redis.from_url(valkey_url)

    queue = Queue(queue_name, connection=connection)
    reconcile_worker_jobs(queue)
    worker = Worker([queue], connection=connection)
    worker.work()


if __name__ == "__main__":
    main()
