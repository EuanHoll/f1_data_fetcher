import os
from datetime import datetime, timezone


def get_valkey_url():
    return os.environ.get("VALKEY_URL", "redis://127.0.0.1:6379/0")


def get_queue_name():
    return os.environ.get("RQ_QUEUE_NAME", "ingest")


def get_worker_api_key():
    return os.environ.get("WORKER_API_KEY", "")


def get_ingest_base_url(default: str = "http://web:3000"):
    base_url = os.environ.get("INGEST_BASE_URL", default).rstrip("/")
    if "localhost" in base_url or "127.0.0.1" in base_url:
        return "http://web:3000"
    return base_url


def get_ingest_api_key(required: bool = False):
    api_key = os.environ.get("INGEST_API_KEY", "")
    if required and not api_key:
        raise RuntimeError("INGEST_API_KEY is required.")
    return api_key


def get_fastf1_cache_dir(default: str = "/data/fastf1-cache"):
    return os.environ.get("FASTF1_CACHE_DIR", default)


def get_catalog_year_range():
    return int(os.environ.get("CATALOG_START_YEAR", "2018")), int(os.environ.get("CATALOG_END_YEAR", str(datetime.now(timezone.utc).year + 1)))
