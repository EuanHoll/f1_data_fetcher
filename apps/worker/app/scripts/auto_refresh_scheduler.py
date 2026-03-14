import time

from app.config import (
    get_auto_refresh_historical_limit,
    get_auto_refresh_interval_seconds,
    get_auto_refresh_live_limit,
    get_ingest_api_key,
    get_ingest_base_url,
)
from app.queue import get_queue
from app.services.http_client import create_http_session, post_json


def run_once(http_session, base_url: str, api_key: str, live_limit: int, historical_limit: int):
    return post_json(
        http_session,
        f"{base_url.rstrip('/')}/api/ingest/auto-refresh",
        api_key,
        {"liveLimit": live_limit, "historicalLimit": historical_limit},
    )


def reconcile_queue_state(http_session, base_url: str, api_key: str):
    from rq.registry import StartedJobRegistry

    queue = get_queue()
    active_job_ids = list(queue.job_ids) + StartedJobRegistry(queue=queue).get_job_ids()
    return post_json(
        http_session,
        f"{base_url.rstrip('/')}/api/ingest/worker-job/reconcile",
        api_key,
        {
            "activeJobIds": sorted(set(active_job_ids)),
            "message": "Worker job no longer exists in the queue",
        },
    )


def run_with_retry(http_session, base_url: str, api_key: str, live_limit: int, historical_limit: int, retries: int = 5):
    last_error = None
    for attempt in range(retries):
        try:
            return run_once(http_session, base_url, api_key, live_limit, historical_limit)
        except Exception as exc:
            last_error = exc
            if attempt < retries - 1:
                time.sleep(5)
    if last_error is None:
        raise RuntimeError("Auto-refresh failed without an explicit error")
    raise last_error


def main():
    base_url = get_ingest_base_url()
    api_key = get_ingest_api_key(required=True)
    interval_seconds = max(30, get_auto_refresh_interval_seconds())
    live_limit = max(0, get_auto_refresh_live_limit())
    historical_limit = max(0, get_auto_refresh_historical_limit())

    with create_http_session() as http_session:
        while True:
            try:
                reconcile_queue_state(http_session, base_url, api_key)
                result = run_with_retry(http_session, base_url, api_key, live_limit, historical_limit)
                print(
                    "Auto-refresh tick: "
                    f"queued={result.get('queued')} liveQueued={result.get('liveQueued')} "
                    f"historicalQueued={result.get('historicalQueued')}"
                )
            except Exception as exc:
                print(f"Auto-refresh scheduler error: {exc}")
            time.sleep(interval_seconds)


if __name__ == "__main__":
    main()
