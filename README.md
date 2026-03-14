# F1 Pace Lab

F1 Pace Lab is a self-hosted F1 analytics app built around:

- `apps/web` - Next.js + Convex UI and API bridge
- `apps/worker` - FastAPI + RQ + Valkey ingestion worker for FastF1 data
- `docker/convex/docker-compose.yml` - local full-stack runtime

## Local stack

From repo root:

```shell
npm install
docker compose --env-file docker/convex/.env -f docker/convex/docker-compose.yml up -d --build
```

Useful commands:

```shell
npm run web:dev
npm run web:convex:dev
```

## Worker scripts

Manual ingest example:

```shell
cd apps/worker && uv run python -m app.scripts.ingest_session --year 2025 --round 2 --session R --base-url http://localhost:3000
```

Manual catalog sync:

```shell
cd apps/worker && uv run python -m app.scripts.sync_catalog --start-year 2018 --end-year 2026 --base-url http://localhost:3000
```

## Docs

- `LOCAL_CONVEX_DOCKER_SETUP.md`
- `apps/web/README.md`
- `apps/worker/README.md`
- `WEBSITE_VISION_AND_AUTH.md`

## License

Refer to `LICENSE`.
