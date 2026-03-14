import os
from datetime import datetime, timezone

import fastf1
import pandas as pd


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


def map_schedule_sessions(row):
    sessions = []
    for idx in range(1, 6):
        name_col = f"Session{idx}"
        session_name = row.get(name_col)
        if pd.isna(session_name):
            continue
        session_name = str(session_name)
        code = map_session_code(session_name)
        if code:
            sessions.append(code)
    return sessions


def ensure_cache(cache_dir: str | None = None):
    resolved_cache_dir = cache_dir or os.environ.get("FASTF1_CACHE_DIR", ".cache/fastf1")
    os.makedirs(resolved_cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(resolved_cache_dir)
    return resolved_cache_dir
