import argparse
import os
from datetime import datetime

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
    "Testing": "TEST",
}


def to_epoch_ms(value):
    if value is None or pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return int(value.to_pydatetime().timestamp() * 1000)
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    return None


def map_session_code(session_name):
    if not session_name:
        return None
    mapped = SESSION_CODE_MAP.get(session_name)
    if mapped:
        return mapped
    upper = str(session_name).upper()
    if upper.startswith("PRACTICE"):
        suffix = upper.replace("PRACTICE", "").strip()
        return f"FP{suffix}" if suffix.isdigit() else None
    return None


def build_events_payload(schedule_df):
    events = []
    for _, row in schedule_df.iterrows():
        round_number = row.get("RoundNumber")
        event_name = row.get("EventName")

        if pd.isna(round_number) or pd.isna(event_name):
            continue

        sessions = []
        for idx in range(1, 6):
            name_col = f"Session{idx}"
            date_col = f"Session{idx}Date"
            date_utc_col = f"Session{idx}DateUtc"

            session_name = row.get(name_col)
            if pd.isna(session_name):
                continue

            session_name = str(session_name)
            session_code = map_session_code(session_name)
            if not session_code:
                continue

            date_value = row.get(date_utc_col)
            if pd.isna(date_value):
                date_value = row.get(date_col)

            sessions.append(
                {
                    "sessionCode": session_code,
                    "sessionName": session_name,
                    "startsAt": to_epoch_ms(date_value),
                }
            )

        events.append(
            {
                "round": int(round_number),
                "name": str(event_name),
                "location": None if pd.isna(row.get("Location")) else str(row.get("Location")),
                "startsAt": to_epoch_ms(row.get("EventDate")),
                "sessions": sessions,
            }
        )

    return events


def post_catalog(base_url, api_key, payload):
    response = requests.post(
        f"{base_url.rstrip('/')}/api/ingest/catalog",
        headers={"x-ingest-key": api_key, "content-type": "application/json"},
        json=payload,
        timeout=120,
    )
    response.raise_for_status()
    return response.json()


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

    for year in range(args.start_year, args.end_year + 1):
        print(f"Loading schedule for {year}")
        schedule = fastf1.get_event_schedule(year, include_testing=args.include_testing)
        events = build_events_payload(schedule)

        payload = {
            "year": year,
            "seasonName": f"{year} Formula 1 World Championship",
            "source": "fastf1-catalog-worker",
            "sourceRevision": fastf1.__version__,
            "events": events,
        }

        result = post_catalog(args.base_url, args.api_key, payload)
        print(
            f"{year}: events inserted={result.get('eventsInserted')} updated={result.get('eventsUpdated')} "
            f"sessions inserted={result.get('sessionsInserted')} updated={result.get('sessionsUpdated')}"
        )


if __name__ == "__main__":
    main()
