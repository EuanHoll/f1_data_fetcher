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

## Start the app

From repo root:

```bash
npm run web:dev
```

## Push Convex functions

From repo root:

```bash
npm run web:convex:dev
```

The first run generates Convex types under `apps/web/convex/_generated`.

## Troubleshooting (self-hosted)

If you see an error like `start_push ... missing field 'functions'`, the Convex CLI package version and self-hosted backend image are out of sync.

Use matching versions for:

- `ghcr.io/get-convex/convex-backend`
- `ghcr.io/get-convex/convex-dashboard`
- `convex` npm package in `apps/web/package.json`

## Current scope

- App shell and environment health page
- Initial Convex schema with core tables
- Early starter functions (`health`, `sessions`, `users`, `savedViews`)

## Next implementation slices

1. Add Session Explorer query + UI wiring
2. Add Compare Lab query contracts
3. Add Auth.js integration and user sync flow
