# F1 Pace Lab Web App (Kickoff)

This is the initial Next.js + Convex scaffold for the web migration.

## Prerequisites

1. Local self-hosted Convex backend running (see `LOCAL_CONVEX_DOCKER_SETUP.md`)
2. Node.js 20+

## Setup

From repo root:

```bash
npm install
```

Create `apps/web/.env.local` from `apps/web/.env.local.example` and set:

- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_SELF_HOSTED_URL`
- `CONVEX_SELF_HOSTED_ADMIN_KEY`
- `NEXTAUTH_SECRET`

## Start the app

From repo root:

```bash
npm run web:dev
```

Docker-contained full stack (Convex + dashboard + web + worker):

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml up -d --build
```

This keeps ingestion execution inside the `worker` container and avoids launching host terminal processes.

## Push Convex functions

From repo root:

```bash
npm run web:convex:dev
```

The first run generates Convex types under `apps/web/convex/_generated`.

If you only want a single push/codegen pass:

```bash
npx convex dev --once --typecheck disable
```

## Troubleshooting (self-hosted)

If you see an error like `start_push ... missing field 'functions'`, the Convex CLI package version and self-hosted backend image are out of sync.

Use matching versions for:

- `ghcr.io/get-convex/convex-backend`
- `ghcr.io/get-convex/convex-dashboard`
- `convex` npm package in `apps/web/package.json`

## Current scope

- App shell and environment health page
- Session Explorer table wired to live Convex query
- Session Explorer seed action to create sample event/session rows
- Dev credentials auth scaffold (Auth.js) with user upsert sync into Convex
- Optional OAuth provider support (GitHub) when env vars are present
- Guest access is fully supported; login is only required for saved views
- Initial Convex schema with core tables
- Starter functions (`health`, `sessions`, `users`, `savedViews`)

## Next implementation slices

1. Add Session Explorer query + UI wiring
2. Add Compare Lab query contracts
3. Add Auth.js integration and user sync flow

## Data source strategy (important)

For F1 session detail (laps, sectors, compounds, telemetry), there is no Node package that matches FastF1 depth and reliability.

Recommended approach:

1. Keep Python `fastf1` as the canonical ingestion worker
2. Normalize and upsert into Convex
3. Serve the website from Convex-backed cached data

Fallback/public alternatives for lighter data exist (for example OpenF1/Jolpica APIs), but they do not replace full FastF1 coverage for serious pace analysis.

## Cache policy

- Historical sessions: persist locally, reuse cached data, refresh only on manual force or stale TTL.
- Live/near-live sessions: bypass cache more frequently and refresh on short intervals.

This policy is implemented in `apps/web/convex/ingestion.ts`:

- `getSessionRefreshPolicy`
- `markSessionRefreshed`

## FastF1 -> Convex bridge

The web app exposes `POST /api/ingest/session` for ingestion phases:

1. `upsert_session`
2. `push_laps`
3. `finalize`

This endpoint requires `x-ingest-key` matching `INGEST_API_KEY`.

Catalog endpoint:

- `POST /api/ingest/catalog`

Use this to sync available seasons/events/sessions metadata so the app knows what exists before detailed lap ingest runs.

Run worker example from repo root:

```bash
python apps/worker/ingest_fastf1_session.py --year 2025 --round 2 --session R --base-url http://localhost:3000
```

Sync available calendar metadata:

```bash
python apps/worker/sync_fastf1_catalog.py --start-year 2018 --end-year 2026 --base-url http://localhost:3000
```
