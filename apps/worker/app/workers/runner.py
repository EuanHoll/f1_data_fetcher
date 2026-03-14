import time
import os

from rq import Worker
from rq.registry import StartedJobRegistry

from app.config import get_ingest_api_key, get_ingest_base_url
from app.queue import get_queue
from app.services.http_client import create_http_session
from app.services.worker_status import reconcile_worker_jobs


def reconcile_active_jobs(queue):
    api_key = get_ingest_api_key(required=False)
    if not api_key:
        return

    active_job_ids = list(queue.job_ids) + StartedJobRegistry(queue=queue).get_job_ids()
    with create_http_session() as http_session:
        last_error = None
        for _ in range(20):
            try:
                reconcile_worker_jobs(
                    http_session,
                    get_ingest_base_url(),
                    api_key,
                    active_job_ids,
                    "Worker restarted and did not find this job in the live queue",
                )
                return
            except Exception as exc:
                last_error = exc
                time.sleep(3)
        print(f"Worker job reconciliation skipped: {last_error}")


def main():
    queue = get_queue()
    if os.environ.get("WORKER_CHILD_INDEX", "0") == "0":
        reconcile_active_jobs(queue)
    worker = Worker([queue], connection=queue.connection)
    worker.work()


if __name__ == "__main__":
    main()
