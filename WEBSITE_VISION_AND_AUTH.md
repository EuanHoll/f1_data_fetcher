# F1 Data Fetcher -> F1 Analytics Web Platform

## Why this exists

This repository now centers on a self-hosted web analytics platform backed by Convex, Next.js, and a Python FastF1 ingestion worker.

We are evolving it into a self-hosted web product that lets users explore, compare, and share F1 performance analysis online.

The goal is to move from a single-user data export tool to a multi-user analytics platform.

## Product direction

### Current state (today)

- Input: year, race number, session type
- Action: fetch one session via `fastf1`
- Output: Convex-backed session and lap data for the web app

### Target state (web)

- Interactive session explorer in browser
- Driver/team/session comparisons
- Precomputed performance insights
- Saved views and shareable links
- User accounts and personalized dashboards

### Product positioning

Think of this as an "F1 Pace Lab":

- Not just a downloader
- A tool for answering questions like:
  - "Who had better long-run pace in FP2?"
  - "How did team pace change from qualifying to race?"
  - "Which driver is strongest in sector 2 across recent rounds?"

## V1 scope (practical first release)

### Must-have

1. Session explorer page
2. Driver vs driver comparison
3. Team vs team comparison
4. Stint and tire pace charts
5. CSV export for selected views
6. Authenticated saved views (private by default)
7. Shareable public link for specific analysis view

### Nice-to-have (later)

- Auto-generated textual insights
- Driver profile pages with season trends
- Alerts/favorites
- Community shared dashboards

## Suggested architecture (self-hosted Convex)

### High-level components

1. Frontend: Next.js + TypeScript
2. App backend/data layer: self-hosted Convex
3. Ingestion worker: Python + `fastf1` + `pandas`
4. Optional cache/edge: CDN and HTTP caching for public pages
5. Reverse proxy/TLS: Caddy or Traefik

### Why this split

- Keep existing domain logic in Python where `fastf1` integration is strongest
- Use Convex for app data model, authorization checks, and reactive query patterns
- Keep frontend focused on UX, visualization, and navigation

## Data model (initial)

Proposed Convex tables:

- `users`
- `savedViews`
- `favorites`
- `seasons`
- `events`
- `sessions`
- `drivers`
- `teams`
- `laps`
- `sessionSummaries`
- `ingestionRuns`

### Notes

- `laps` should be indexed for key query patterns (session, driver, team, stint)
- `sessionSummaries` stores precomputed metrics for fast UI loads
- `ingestionRuns` tracks idempotency, source revisions, and failures

## Auth architecture (self-hosted Convex)

## Short answer on "magic auth"

Self-hosted Convex can still support robust auth and authorization, but it is less turnkey than managed hosting. You retain capability, but own setup and operations.

## Recommended auth stack

1. Next.js + Auth.js for sign-in UI and provider flows
2. JWT-based identity tokens passed to Convex
3. Convex-side auth checks in every user-scoped query/mutation
4. Role claims in JWT for admin-only operations

## Trust and identity flow

1. User signs in on Next.js (Auth.js provider)
2. Auth.js issues/maintains a session and token
3. Frontend calls Convex with authenticated token
4. Convex verifies JWT signature, issuer, audience, and expiry
5. Convex functions map token subject to app user record
6. Data access is allowed/denied per owner and role rules

## Authorization model

### Ownership rules

- `savedViews`: owner can read/write/delete
- Public saved view: readable by anyone with link
- Private saved view: readable only by owner

### Role rules

- `admin`: can trigger reingestion/rebuild jobs
- `analyst` (optional): can publish curated dashboards
- `user`: standard read/write in own scope

### Security rules to enforce

- Never trust client-provided user IDs
- Resolve user identity from verified token only
- Validate all mutation inputs with schemas
- Apply server-side filtering before returning documents

## Secrets and operational responsibilities (self-hosted)

You are responsible for:

- JWT signing/verification config
- Provider client IDs/secrets
- Session key management and rotation
- Email infrastructure (if using email sign-in)
- TLS and secure cookie settings
- Backups and restore testing
- Monitoring and incident response

## Environment layout

Recommended environments:

- `local`: docker compose, local auth provider config
- `staging`: production-like auth and data shape, non-critical traffic
- `prod`: hardened secrets, backups, observability, rate limits

Keep separate keys/secrets per environment and never reuse production secrets in development.

## Ingestion and compute pipeline

## Flow

1. Trigger ingest job (manual or scheduled)
2. Python worker fetches `fastf1` session data
3. Normalize and upsert canonical records
4. Record run metadata in `ingestionRuns`
5. Build or refresh `sessionSummaries`
6. Surface ingest status/errors in admin UI

## Reliability requirements

- Idempotent upserts for reruns
- Retry policy with backoff
- Partial failure logging with recoverable checkpoints
- Clear operator visibility (last success per session)

## API and page map (V1)

### Pages

- `/` latest highlights and quick links
- `/sessions/[year]/[round]/[type]` session explorer
- `/compare` comparison builder
- `/saved/[id]` shared saved view
- `/account` favorites and saved analyses
- `/admin/ingestion` ingest controls and job history (admin only)

### Core query capabilities

- fetch session metadata and participants
- fetch lap table with filters
- fetch comparison aggregates (pace deltas, consistency)
- fetch stint-level summaries
- fetch and store saved view configs

## Delivery plan

## Phase 0: Foundation

- Set up monorepo layout for web app + worker
- Stand up self-hosted Convex + Next.js + Auth.js
- Implement base user table and auth wiring

## Phase 1: Data backbone

- Build ingestion service from current Python logic
- Define canonical schema and indexes
- Implement summary generation jobs

## Phase 2: UX MVP

- Ship session explorer and comparison page
- Add CSV export and saved views
- Add share links and public/private visibility control

## Phase 3: Hardening

- Add admin ingestion dashboard
- Add monitoring, backups, and alerting
- Load test critical queries and optimize indexes

## Risks and mitigations

- Data volume growth -> precompute summaries and enforce pagination
- Auth complexity in self-hosted setup -> keep Auth.js integration minimal first
- Ingest instability from source changes -> pin worker versions and add run diagnostics
- Cost of chart-heavy pages -> server-side aggregation and client-side lazy loading

## Definition of done for V1

- User can sign in and save a private analysis view
- User can open any session and run at least one driver comparison
- User can share a read-only public view by URL
- Admin can ingest or reingest a session with status visibility
- Core pages load within acceptable latency on target infrastructure

## Immediate next steps

1. Create `apps/web` (Next.js) and `apps/worker` (Python ingestion)
2. Add Convex schema scaffolding for core tables listed above
3. Implement auth path end-to-end (Auth.js -> Convex token verification -> user mapping)
4. Ship a thin vertical slice: one session page with one comparison chart and saved view support

## Decision log (initial)

- Keep Python + `fastf1` for ingestion
- Use self-hosted Convex for app backend and data access
- Use Auth.js as primary auth orchestration layer
- Build MVP around analysis UX first, community features second
