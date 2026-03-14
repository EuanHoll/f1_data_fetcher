# Local Self-Hosted Convex Setup (Docker)

This document sets up a local full stack (Convex backend + dashboard + web app + ingestion worker) using Docker Compose for this repository.

It is intended as the first infrastructure step before building the Next.js frontend and Convex functions.

## What you get

- Convex backend on `http://127.0.0.1:3210`
- Convex HTTP actions/site proxy on `http://127.0.0.1:3211`
- Convex dashboard on `http://127.0.0.1:6791`
- Next.js web app on `http://127.0.0.1:3000`
- Python ingestion control API on `http://127.0.0.1:8080`
- Three parallel ingestion queue consumers for FastF1 session jobs
- Convex function sync watcher (`convex-dev` service) that auto-creates/updates schema and functions
- MinIO S3 API on `http://127.0.0.1:9000`
- MinIO console on `http://127.0.0.1:9001`
- Local persisted data in a Docker named volume (`convex_data_s3`)

## Files added

- `docker/convex/docker-compose.yml`
- `docker/convex/.env`

## Prerequisites

1. Docker Desktop (or Docker Engine + Compose plugin)
2. Node.js 20+ (for Convex CLI)

## 1) Start the full stack

From repo root:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml up -d --scale worker-runner=3
```

To rebuild app images after Dockerfile/dependency changes:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml up -d --build --scale worker-runner=3
```

Then run the one-shot catalog bootstrap when needed:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml --profile bootstrap run --rm worker-bootstrap
```

Or use the convenience scripts (same `--dev` / `--prod` pattern as your website repo):

```bash
WORKER_CONCURRENCY=3 ./start.sh --dev
WORKER_CONCURRENCY=3 ./start.sh --prod
```

```powershell
$env:WORKER_CONCURRENCY=3; .\start.ps1 --dev
$env:WORKER_CONCURRENCY=3; .\start.ps1 --prod
```

To watch logs:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml logs -f
```

## 2) Generate admin key

Run once after backend is healthy:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml exec backend ./generate_admin_key.sh
```

Copy the printed key value.

## 3) Configure local Convex CLI credentials

Create `.env.local` in repo root with:

```bash
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<paste-admin-key>
```

`.env.local` is gitignored in this repo.

## 4) Install Convex CLI and verify

If/when your web app package exists, install Convex there. For now you can verify from repo root:

```bash
npm install --save-dev convex@latest
npx convex --help
```

Once your Convex project files are added, expected workflow is:

```bash
npx convex dev
```

## 5) Validate endpoints

- Backend version endpoint: `http://127.0.0.1:3210/version`
- Dashboard: `http://127.0.0.1:6791`
- Web app: `http://127.0.0.1:3000`
- Worker health: `http://127.0.0.1:8080/health`
- MinIO health: `http://127.0.0.1:9000/minio/health/live`

If tables/functions are missing, check the `convex-dev` service logs:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml logs -f convex-dev
```

## Common operations

Stop services:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml stop
```

Start again:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml start
```

Destroy containers (keep data):

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml down
```

Destroy containers and wipe local Convex data:

```bash
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml down -v
```

## Notes for upcoming auth integration

- Self-hosted Convex supports auth, but setup is manual.
- We will use `Next.js + Auth.js` for login, then pass verified JWT identity to Convex.
- Keep production auth secrets out of Docker Compose files and inject via environment variables only.

## Why this setup fits our roadmap

- Keeps backend local and reproducible while we build the website MVP
- Matches the planned self-hosted Convex architecture in `WEBSITE_VISION_AND_AUTH.md`
- Lets us wire ingestion, schema, and auth incrementally without switching platforms
