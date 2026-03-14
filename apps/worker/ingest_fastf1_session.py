import argparse
import os
from datetime import datetime, timezone

import fastf1
import pandas as pd
import requests


def to_ms(value):
    if pd.isna(value):
        return None
    try:
        return int(value.total_seconds() * 1000)
    except Exception:
        return None


def to_epoch_ms(value):
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        if value.tzinfo is None:
            value = value.tz_localize(timezone.utc)
        return int(value.timestamp() * 1000)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)
    return None


def post(base_url, api_key, payload):
    response = requests.post(
        f"{base_url.rstrip('/')}/api/ingest/session",
        json=payload,
        headers={"x-ingest-key": api_key, "content-type": "application/json"},
        timeout=120,
    )
    if response.status_code >= 400:
        print(f"Request failed ({response.status_code}): {response.text}")
        response.raise_for_status()
    return response.json()


def normalize_laps(df):
    records = []
    for _, row in df.iterrows():
        lap_number = row.get("LapNumber")
        driver_code = row.get("Driver")
        if pd.isna(lap_number) or pd.isna(driver_code):
            continue

        payload = {
            "driverCode": str(driver_code),
            "teamCode": None if pd.isna(row.get("Team")) else str(row.get("Team")),
            "lapNumber": int(lap_number),
            "lapTimeMs": to_ms(row.get("LapTime")),
            "sector1Ms": to_ms(row.get("Sector1Time")),
            "sector2Ms": to_ms(row.get("Sector2Time")),
            "sector3Ms": to_ms(row.get("Sector3Time")),
            "compound": None if pd.isna(row.get("Compound")) else str(row.get("Compound")),
            "stint": None if pd.isna(row.get("Stint")) else int(row.get("Stint")),
            "isPitInLap": False if pd.isna(row.get("PitInTime")) else True,
            "isPitOutLap": False if pd.isna(row.get("PitOutTime")) else True,
        }
        payload = {key: value for key, value in payload.items() if value is not None}
        records.append(payload)
    return records


def main():
    parser = argparse.ArgumentParser(description="Ingest one FastF1 session into Convex via Next API")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--round", type=int, required=True)
    parser.add_argument("--session", type=str, required=True, help="FP1|FP2|FP3|Q|R")
    parser.add_argument("--base-url", type=str, default="http://localhost:3000")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--cache-dir", type=str, default=".cache/fastf1")
    parser.add_argument("--api-key", type=str, default=os.environ.get("INGEST_API_KEY", ""))
    args = parser.parse_args()

    if not args.api_key:
        raise RuntimeError("INGEST_API_KEY is required (arg or env var).")

    os.makedirs(args.cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(args.cache_dir)

    print(f"Loading FastF1 session {args.year} R{args.round} {args.session}")
    session = fastf1.get_session(args.year, args.round, args.session)
    session.load()

    laps_df = session.laps
    records = normalize_laps(laps_df)
    print(f"Normalized {len(records)} lap rows")

    event_name = str(session.event.EventName)
    location = str(session.event.Location)
    event_date = session.event.EventDate if hasattr(session.event, "EventDate") else None

    upsert = post(
        args.base_url,
        args.api_key,
        {
            "phase": "upsert_session",
            "year": args.year,
            "round": args.round,
            "eventName": event_name,
            "location": location,
            "eventStartsAt": to_epoch_ms(event_date),
            "sessionCode": args.session,
            "sessionName": str(session.name),
            "sessionStartsAt": to_epoch_ms(getattr(session, "date", None)),
            "source": "fastf1-python-worker",
            "sourceRevision": fastf1.__version__,
        },
    )

    session_id = upsert["sessionId"]
    run_id = upsert["ingestionRunId"]
    print(f"Session id: {session_id}, ingestion run: {run_id}")

    for i in range(0, len(records), args.batch_size):
        batch = records[i : i + args.batch_size]
        result = post(
            args.base_url,
            args.api_key,
            {
                "phase": "push_laps",
                "sessionId": session_id,
                "laps": batch,
            },
        )
        print(f"Batch {i // args.batch_size + 1}: inserted={result.get('inserted')} updated={result.get('updated')}")

    final = post(
        args.base_url,
        args.api_key,
        {
            "phase": "finalize",
            "ingestionRunId": run_id,
            "sessionId": session_id,
            "success": True,
            "message": f"Ingested {len(records)} laps from FastF1",
        },
    )

    print("Done.")
    print(final)


if __name__ == "__main__":
    main()
