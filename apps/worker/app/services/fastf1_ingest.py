import fastf1
import pandas as pd
from fastf1.core import DataNotLoadedError

from app.services.fastf1_common import ensure_cache, to_epoch_ms, to_ms
from app.services.http_client import create_http_session, post_json


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
        records.append({key: value for key, value in payload.items() if value is not None})
    return records


def normalize_team_color(value):
    if pd.isna(value) or value is None:
        return None
    color = str(value).strip().lstrip("#")
    if not color:
        return None
    return f"#{color.upper()}"


def parse_optional_int(value):
    if pd.isna(value) or value is None:
        return None
    try:
        return int(str(value))
    except Exception:
        return None


def normalize_participants(session):
    try:
        results = session.results
    except Exception:
        results = None

    participants = []
    seen_driver_codes = set()

    if results is not None:
        try:
            iterable = results.to_dict("records")
        except Exception:
            iterable = []

        for row in iterable:
            driver_code = row.get("Abbreviation") or row.get("Driver")
            if pd.isna(driver_code) or not driver_code:
                continue

            driver_code = str(driver_code).strip().upper()
            if not driver_code or driver_code in seen_driver_codes:
                continue

            seen_driver_codes.add(driver_code)
            team_name = None if pd.isna(row.get("TeamName")) else str(row.get("TeamName"))
            participant = {
                "driverCode": driver_code,
                "fullName": None if pd.isna(row.get("FullName")) else str(row.get("FullName")),
                "driverNumber": parse_optional_int(row.get("DriverNumber")),
                "teamCode": team_name,
                "teamName": team_name,
                "teamColorHex": normalize_team_color(row.get("TeamColor")),
            }
            participants.append({key: value for key, value in participant.items() if value is not None})

    if participants:
        return participants

    laps = getattr(session, "laps", None)
    if laps is None:
        return participants

    try:
        unique_rows = laps[["Driver", "Team"]].dropna(subset=["Driver"]).drop_duplicates().to_dict("records")
    except Exception:
        unique_rows = []

    for row in unique_rows:
        driver_code = row.get("Driver")
        if pd.isna(driver_code) or not driver_code:
            continue
        driver_code = str(driver_code).strip().upper()
        if not driver_code or driver_code in seen_driver_codes:
            continue
        seen_driver_codes.add(driver_code)
        team_name = None if pd.isna(row.get("Team")) else str(row.get("Team"))
        participant = {
            "driverCode": driver_code,
            "teamCode": team_name,
            "teamName": team_name,
        }
        participants.append({key: value for key, value in participant.items() if value is not None})

    return participants


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

        try:
            records = normalize_laps(session.laps)
        except DataNotLoadedError:
            records = []
        participants = normalize_participants(session)
        print(f"Normalized {len(records)} lap rows")
        print(f"Normalized {len(participants)} participants")

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

        if participants:
            participant_result = post_json(
                http_session,
                phase_url,
                api_key,
                {"phase": "push_participants", "participants": participants},
            )
            print(
                "Participants: "
                f"drivers inserted={participant_result.get('driverInserts')} updated={participant_result.get('driverUpdates')} "
                f"teams inserted={participant_result.get('teamInserts')} updated={participant_result.get('teamUpdates')}"
            )

        inserted = 0
        updated = 0
        for index in range(0, len(records), batch_size):
            batch = records[index : index + batch_size]
            result = post_json(
                http_session,
                phase_url,
                api_key,
                {"phase": "push_laps", "sessionId": session_id, "laps": batch},
            )
            inserted += int(result.get("inserted") or 0)
            updated += int(result.get("updated") or 0)
            print(f"Batch {index // batch_size + 1}: inserted={result.get('inserted')} updated={result.get('updated')}")

        final = post_json(
            http_session,
            phase_url,
            api_key,
            {
                "phase": "finalize",
                "ingestionRunId": run_id,
                "sessionId": session_id,
                "success": True,
                "message": f"Ingested {len(records)} laps from FastF1" if records else "No lap data available from FastF1 for this session",
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
