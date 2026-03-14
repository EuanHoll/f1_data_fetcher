# F1 Ingestion Worker

This worker fetches FastF1 data and pushes it into Convex through the Next API bridge.

## Why this exists

- FastF1 has the richest Python ecosystem support for F1 session data.
- The website should read from Convex (cached) instead of re-fetching every page load.

## Script

- `apps/worker/ingest_fastf1_session.py`
- `apps/worker/sync_fastf1_catalog.py`

## Usage

### Recommended: Docker-contained worker API

The local stack now runs a FastAPI worker control API inside Docker (`worker`) with Valkey + RQ for durable queueing and a separate `worker-runner` process for execution. The web app queues ingest jobs to that service, so no host terminal windows are spawned and jobs survive API restarts.

Start the full stack from repo root:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml up -d --build
```

Then use `/ingestion` in the web UI to queue single/batch ingest jobs.

The worker uses `uv` with dependency metadata in `apps/worker/pyproject.toml` and a committed lockfile at `apps/worker/uv.lock` so installs stay reproducible.

### Direct script usage (optional)

```bash
python apps/worker/ingest_fastf1_session.py --year 2025 --round 2 --session R --base-url http://localhost:3000
```

Catalog sync (discover what exists across seasons):

```bash
python apps/worker/sync_fastf1_catalog.py --start-year 2018 --end-year 2026 --base-url http://localhost:3000
```

Required env var:

- `INGEST_API_KEY` (must match `apps/web/.env.local`)

Optional args:

- `--batch-size` (default `500`)
- `--cache-dir` (default `.cache/fastf1`)

## Ingest behavior

1. Upsert season/event/session context in Convex
2. Push lap rows in batches
3. Finalize ingestion run and update session cache metadata

Historical sessions stay cached in Convex with long TTL. Live-window sessions get short TTL and refresh more frequently.

## Suggested schedule

- Catalog sync (`sync_fastf1_catalog.py`): every 6-24 hours
- Live weekend session ingest (`ingest_fastf1_session.py`): every 5-10 minutes for active sessions
- Historical backfill ingest: one-off or nightly until complete
