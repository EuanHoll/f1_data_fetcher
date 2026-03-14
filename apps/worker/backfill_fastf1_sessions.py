import argparse
import os
from datetime import datetime, timezone

import fastf1
import pandas as pd
import requests


SESSION_CODE_MAP = {
    "Practice 1": "FP1",
    "Practice 2": "FP2",
    "Practice 3": "FP3",
    "Qualifying": "Q",
    "Sprint": "S",
    "Sprint Shootout": "SQ",
    "Sprint Qualifying": "SQ",
    "Race": "R",
}


def to_ms(value):
    if pd.isna(value):
        return None
    try:
        return int(value.total_seconds() * 1000)
    except Exception:
        return None


def to_epoch_ms(value):
    if value is None or pd.isna(value):
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
        timeout=180,
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


def map_schedule_sessions(row):
    sessions = []
    for idx in range(1, 6):
        name_col = f"Session{idx}"
        session_name = row.get(name_col)
        if pd.isna(session_name):
            continue
        session_name = str(session_name)
        code = SESSION_CODE_MAP.get(session_name)
        if not code:
            continue
        sessions.append(code)
    return sessions


def ingest_session(base_url, api_key, year, round_number, session_code, batch_size):
    session = fastf1.get_session(year, round_number, session_code)
    session.load()
    records = normalize_laps(session.laps)

    event_name = str(session.event.EventName)
    location = str(session.event.Location)
    event_date = session.event.EventDate if hasattr(session.event, "EventDate") else None

    upsert = post(
        base_url,
        api_key,
        {
            "phase": "upsert_session",
            "year": year,
            "round": round_number,
            "eventName": event_name,
            "location": location,
            "eventStartsAt": to_epoch_ms(event_date),
            "sessionCode": session_code,
            "sessionName": str(session.name),
            "sessionStartsAt": to_epoch_ms(getattr(session, "date", None)),
            "source": "fastf1-backfill-worker",
            "sourceRevision": fastf1.__version__,
        },
    )

    session_id = upsert["sessionId"]
    run_id = upsert["ingestionRunId"]

    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        post(
            base_url,
            api_key,
            {
                "phase": "push_laps",
                "sessionId": session_id,
                "laps": batch,
            },
        )

    post(
        base_url,
        api_key,
        {
            "phase": "finalize",
            "ingestionRunId": run_id,
            "sessionId": session_id,
            "success": True,
            "message": f"Backfilled {len(records)} laps",
        },
    )
    return len(records)


def main():
    parser = argparse.ArgumentParser(description="Backfill FastF1 sessions into Convex")
    parser.add_argument("--start-year", type=int, default=2018)
    parser.add_argument("--end-year", type=int, default=datetime.now(timezone.utc).year)
    parser.add_argument("--session-codes", type=str, default="R,Q", help="Comma separated codes, e.g. R,Q,FP1")
    parser.add_argument("--base-url", type=str, default="http://localhost:3000")
    parser.add_argument("--api-key", type=str, default=os.environ.get("INGEST_API_KEY", ""))
    parser.add_argument("--batch-size", type=int, default=400)
    parser.add_argument("--cache-dir", type=str, default=".cache/fastf1")
    parser.add_argument("--max-sessions", type=int, default=0)
    args = parser.parse_args()

    if not args.api_key:
        raise RuntimeError("INGEST_API_KEY is required (arg or env var).")

    wanted = {code.strip().upper() for code in args.session_codes.split(",") if code.strip()}

    os.makedirs(args.cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(args.cache_dir)

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
                    laps = ingest_session(args.base_url, args.api_key, year, int(round_number), session_code, args.batch_size)
                    processed_sessions += 1
                    total_laps += laps
                    print(f"Done: {year} R{int(round_number)} {session_code} ({laps} laps)")
                except Exception as exc:
                    print(f"Failed: {year} R{int(round_number)} {session_code}: {exc}")

    print(f"Backfill finished. Processed sessions: {processed_sessions}, total laps: {total_laps}")


if __name__ == "__main__":
    main()
