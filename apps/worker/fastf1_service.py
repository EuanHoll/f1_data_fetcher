import os
from datetime import datetime, timezone
from typing import Iterable

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
        code = map_session_code(session_name)
        if not code:
            continue
        sessions.append(code)
    return sessions


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


def create_http_session():
    session = requests.Session()
    session.headers.update({"content-type": "application/json"})
    return session


def post_json(http_session, url: str, api_key: str, payload):
    response = http_session.post(
        url,
        json=payload,
        headers={"x-ingest-key": api_key},
        timeout=180,
    )
    if response.status_code >= 400:
        print(f"Request failed ({response.status_code}): {response.text}")
        response.raise_for_status()
    return response.json()


def ensure_cache(cache_dir: str | None = None):
    resolved_cache_dir = cache_dir or os.environ.get("FASTF1_CACHE_DIR", ".cache/fastf1")
    os.makedirs(resolved_cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(resolved_cache_dir)
    return resolved_cache_dir


def ingest_fastf1_session(
    base_url: str,
    api_key: str,
    year: int,
    round_number: int,
    session_code: str,
    batch_size: int = 500,
    cache_dir: str | None = None,
    source: str = "fastf1-python-worker",
):
    ensure_cache(cache_dir)
    http_session = create_http_session()
    phase_url = f"{base_url.rstrip('/')}/api/ingest/session"

    run_id = None
    session_id = None

    try:
        print(f"Loading FastF1 session {year} R{round_number} {session_code}")
        session = fastf1.get_session(year, round_number, session_code)
        session.load()

        records = normalize_laps(session.laps)
        print(f"Normalized {len(records)} lap rows")

        event_name = str(session.event.EventName)
        location = str(session.event.Location)
        event_date = session.event.EventDate if hasattr(session.event, "EventDate") else None

        upsert = post_json(
            http_session,
            phase_url,
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
                "source": source,
                "sourceRevision": fastf1.__version__,
            },
        )

        session_id = upsert["sessionId"]
        run_id = upsert["ingestionRunId"]
        print(f"Session id: {session_id}, ingestion run: {run_id}")

        inserted = 0
        updated = 0
        for index in range(0, len(records), batch_size):
            batch = records[index : index + batch_size]
            result = post_json(
                http_session,
                phase_url,
                api_key,
                {
                    "phase": "push_laps",
                    "sessionId": session_id,
                    "laps": batch,
                },
            )
            inserted += int(result.get("inserted") or 0)
            updated += int(result.get("updated") or 0)
            print(
                f"Batch {index // batch_size + 1}: inserted={result.get('inserted')} updated={result.get('updated')}"
            )

        final = post_json(
            http_session,
            phase_url,
            api_key,
            {
                "phase": "finalize",
                "ingestionRunId": run_id,
                "sessionId": session_id,
                "success": True,
                "message": f"Ingested {len(records)} laps from FastF1",
            },
        )

        return {
            "sessionId": session_id,
            "ingestionRunId": run_id,
            "lapCount": len(records),
            "inserted": inserted,
            "updated": updated,
            "finalize": final,
        }
    except Exception as exc:
        if run_id and session_id:
            try:
                post_json(
                    http_session,
                    phase_url,
                    api_key,
                    {
                        "phase": "finalize",
                        "ingestionRunId": run_id,
                        "sessionId": session_id,
                        "success": False,
                        "message": str(exc),
                    },
                )
            except Exception:
                pass
        raise
    finally:
        http_session.close()


def sync_fastf1_catalog(
    base_url: str,
    api_key: str,
    start_year: int,
    end_year: int,
    include_testing: bool = False,
    source: str = "fastf1-catalog-worker",
) -> Iterable[dict]:
    http_session = create_http_session()
    catalog_url = f"{base_url.rstrip('/')}/api/ingest/catalog"

    try:
        for year in range(start_year, end_year + 1):
            print(f"Loading schedule for {year}")
            schedule = fastf1.get_event_schedule(year, include_testing=include_testing)
            events = build_events_payload(schedule)

            payload = {
                "year": year,
                "seasonName": f"{year} Formula 1 World Championship",
                "source": source,
                "sourceRevision": fastf1.__version__,
                "events": events,
            }

            result = post_json(http_session, catalog_url, api_key, payload)
            yield {
                "year": year,
                "eventsInserted": result.get("eventsInserted"),
                "eventsUpdated": result.get("eventsUpdated"),
                "sessionsInserted": result.get("sessionsInserted"),
                "sessionsUpdated": result.get("sessionsUpdated"),
            }
    finally:
        http_session.close()
