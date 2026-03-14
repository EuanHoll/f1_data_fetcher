from typing import Iterable

import fastf1
import pandas as pd

from app.services.fastf1_common import map_session_code, to_epoch_ms
from app.services.http_client import create_http_session, post_json


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

            sessions.append({"sessionCode": session_code, "sessionName": session_name, "startsAt": to_epoch_ms(date_value)})

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
