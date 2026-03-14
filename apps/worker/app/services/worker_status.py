import json

from app.services.http_client import post_json


def post_worker_job_update(http_session, base_url: str, api_key: str, payload: dict):
    return post_json(http_session, f"{base_url.rstrip('/')}/api/ingest/worker-job", api_key, payload)


def reconcile_worker_jobs(http_session, base_url: str, api_key: str, active_job_ids: list[str], message: str):
    return post_json(
        http_session,
        f"{base_url.rstrip('/')}/api/ingest/worker-job/reconcile",
        api_key,
        {"activeJobIds": sorted(set(active_job_ids)), "message": message},
    )


def serialize_results(results):
    return json.dumps(results)
