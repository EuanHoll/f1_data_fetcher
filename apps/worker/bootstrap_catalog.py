import os
import time
from datetime import datetime, timezone

import requests

from fastf1_service import sync_fastf1_catalog


def wait_for_bootstrap_status(base_url: str, timeout_seconds: int = 300):
    url = f"{base_url.rstrip('/')}/api/ingest/catalog/bootstrap"
    deadline = time.time() + timeout_seconds
    last_error = None

    while time.time() < deadline:
        try:
            response = requests.get(url, timeout=15)
            response.raise_for_status()
            payload = response.json()
            if payload.get("ok") is True:
                return payload
            last_error = RuntimeError(f"Unexpected bootstrap payload: {payload}")
        except Exception as exc:
            last_error = exc
        time.sleep(3)

    raise RuntimeError(f"Timed out waiting for bootstrap status from {url}: {last_error}")


def main():
    base_url = os.environ.get("INGEST_BASE_URL", "http://web:3000")
    api_key = os.environ.get("INGEST_API_KEY", "")
    start_year = int(os.environ.get("CATALOG_START_YEAR", "2018"))
    end_year = int(os.environ.get("CATALOG_END_YEAR", str(datetime.now(timezone.utc).year + 1)))

    if not api_key:
        raise RuntimeError("INGEST_API_KEY is required for catalog bootstrap.")

    status = wait_for_bootstrap_status(base_url)
    if status.get("hasCatalog"):
        print(
            f"Catalog already present (seasons={status.get('seasonCount')}, sessions={status.get('sessionCount')}). Skipping bootstrap."
        )
        return

    print(f"Catalog empty. Bootstrapping FastF1 schedule for years {start_year}-{end_year}.")
    for result in sync_fastf1_catalog(
        base_url=base_url,
        api_key=api_key,
        start_year=start_year,
        end_year=end_year,
        include_testing=False,
        source="fastf1-catalog-bootstrap",
    ):
        print(
            f"{result['year']}: events inserted={result.get('eventsInserted')} updated={result.get('eventsUpdated')} "
            f"sessions inserted={result.get('sessionsInserted')} updated={result.get('sessionsUpdated')}"
        )


if __name__ == "__main__":
    main()
