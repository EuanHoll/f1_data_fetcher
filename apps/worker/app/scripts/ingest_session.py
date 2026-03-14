import argparse

from app.config import get_ingest_api_key
from app.services.fastf1_ingest import ingest_fastf1_session


def main():
    parser = argparse.ArgumentParser(description="Ingest one FastF1 session into Convex via Next API")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--round", type=int, required=True)
    parser.add_argument("--session", type=str, required=True, help="FP1|FP2|FP3|Q|R")
    parser.add_argument("--base-url", type=str, default="http://localhost:3000")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--cache-dir", type=str, default=".cache/fastf1")
    parser.add_argument("--api-key", type=str, default=get_ingest_api_key(required=False))
    args = parser.parse_args()

    if not args.api_key:
        raise RuntimeError("INGEST_API_KEY is required (arg or env var).")

    final = ingest_fastf1_session(base_url=args.base_url, api_key=args.api_key, year=args.year, round_number=args.round, session_code=args.session, batch_size=args.batch_size, cache_dir=args.cache_dir)
    print("Done.")
    print(final)


if __name__ == "__main__":
    main()
