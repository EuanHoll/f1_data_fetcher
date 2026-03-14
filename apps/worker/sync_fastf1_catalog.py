import argparse
import os
from datetime import datetime

from fastf1_service import sync_fastf1_catalog


def main():
    parser = argparse.ArgumentParser(description="Sync FastF1 event catalog to Convex")
    parser.add_argument("--start-year", type=int, default=2018)
    parser.add_argument("--end-year", type=int, default=datetime.utcnow().year)
    parser.add_argument("--base-url", type=str, default="http://localhost:3000")
    parser.add_argument("--api-key", type=str, default=os.environ.get("INGEST_API_KEY", ""))
    parser.add_argument("--include-testing", action="store_true")
    args = parser.parse_args()

    if not args.api_key:
        raise RuntimeError("INGEST_API_KEY is required (arg or env var).")

    for result in sync_fastf1_catalog(
        base_url=args.base_url,
        api_key=args.api_key,
        start_year=args.start_year,
        end_year=args.end_year,
        include_testing=args.include_testing,
    ):
        year = result["year"]
        print(
            f"{year}: events inserted={result.get('eventsInserted')} updated={result.get('eventsUpdated')} "
            f"sessions inserted={result.get('sessionsInserted')} updated={result.get('sessionsUpdated')}"
        )


if __name__ == "__main__":
    main()
