import argparse
from datetime import datetime, timezone

import fastf1
import pandas as pd

from app.config import get_ingest_api_key
from app.services.fastf1_common import ensure_cache, map_schedule_sessions
from app.services.fastf1_ingest import ingest_fastf1_session


def main():
    parser = argparse.ArgumentParser(description="Backfill FastF1 sessions into Convex")
    parser.add_argument("--start-year", type=int, default=2018)
    parser.add_argument("--end-year", type=int, default=datetime.now(timezone.utc).year)
    parser.add_argument("--session-codes", type=str, default="R,Q", help="Comma separated codes, e.g. R,Q,FP1")
    parser.add_argument("--base-url", type=str, default="http://localhost:3000")
    parser.add_argument("--api-key", type=str, default=get_ingest_api_key(required=False))
    parser.add_argument("--batch-size", type=int, default=400)
    parser.add_argument("--cache-dir", type=str, default=".cache/fastf1")
    parser.add_argument("--max-sessions", type=int, default=0)
    args = parser.parse_args()

    if not args.api_key:
        raise RuntimeError("INGEST_API_KEY is required (arg or env var).")

    wanted = {code.strip().upper() for code in args.session_codes.split(",") if code.strip()}
    ensure_cache(args.cache_dir)
    processed_sessions = 0
    total_laps = 0

    for year in range(args.start_year, args.end_year + 1):
        print(f"Loading schedule for {year}")
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        for _, row in schedule.sort_values("RoundNumber").iterrows():
            round_number = row.get("RoundNumber")
            if pd.isna(round_number):
                continue

            available = set(map_schedule_sessions(row))
            target_codes = [code for code in ["R", "Q", "SQ", "S", "FP3", "FP2", "FP1"] if code in available and code in wanted]
            for session_code in target_codes:
                if args.max_sessions and processed_sessions >= args.max_sessions:
                    print(f"Reached max sessions limit ({args.max_sessions}).")
                    print(f"Processed sessions: {processed_sessions}, total laps: {total_laps}")
                    return

                print(f"Ingesting {year} R{int(round_number)} {session_code}")
                try:
                    result = ingest_fastf1_session(base_url=args.base_url, api_key=args.api_key, year=year, round_number=int(round_number), session_code=session_code, batch_size=args.batch_size, cache_dir=args.cache_dir, source="fastf1-backfill-worker")
                    laps = int(result["lapCount"])
                    processed_sessions += 1
                    total_laps += laps
                    print(f"Done: {year} R{int(round_number)} {session_code} ({laps} laps)")
                except Exception as exc:
                    print(f"Failed: {year} R{int(round_number)} {session_code}: {exc}")

    print(f"Backfill finished. Processed sessions: {processed_sessions}, total laps: {total_laps}")


if __name__ == "__main__":
    main()
