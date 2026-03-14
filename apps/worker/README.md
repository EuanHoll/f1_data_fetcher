# F1 Ingestion Worker

This worker fetches FastF1 data and pushes it into Convex through the Next API bridge.

## Why this exists

- FastF1 has the richest Python ecosystem support for F1 session data.
- The website should read from Convex (cached) instead of re-fetching every page load.

## Layout

- `apps/worker/app/main.py` - FastAPI app entrypoint
- `apps/worker/app/routes/` - HTTP routes
- `apps/worker/app/workers/` - RQ runner and job execution
- `apps/worker/app/services/` - FastF1 ingest/catalog and worker status helpers
- `apps/worker/app/scripts/` - manual operator scripts

## Usage

### Recommended: Docker-contained worker API

The local stack now runs a FastAPI worker control API inside Docker (`worker`) with Valkey + RQ for durable queueing and multiple `worker-runner` processes for parallel execution. The web app fans out bulk requests into one job per session, so pending ingestion can be processed concurrently instead of one giant sequential batch.

Start the full stack from repo root:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml up -d --build
```

Then use `/ingestion` in the web UI to queue single/batch ingest jobs.

By default the compose stack starts three queue consumers: `worker-runner`, `worker-runner-2`, and `worker-runner-3`.

The worker uses `uv` with dependency metadata in `apps/worker/pyproject.toml` and a committed lockfile at `apps/worker/uv.lock` so installs stay reproducible.

On an empty local environment, Docker also runs a one-shot catalog bootstrap so the ingestion UI has seasons and sessions to work with by default.

### Direct script usage (optional)

```bash
cd apps/worker && uv run python -m app.scripts.ingest_session --year 2025 --round 2 --session R --base-url http://localhost:3000
```

Catalog sync (discover what exists across seasons):

```bash
cd apps/worker && uv run python -m app.scripts.sync_catalog --start-year 2018 --end-year 2026 --base-url http://localhost:3000
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

- Catalog sync (`app.scripts.sync_catalog`): every 6-24 hours
- Live weekend session ingest (`app.scripts.ingest_session`): every 5-10 minutes for active sessions
- Historical backfill ingest: one-off or nightly until complete
