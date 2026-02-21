# Project Brief: Profit Leak Attorney

This document captures the current system behavior so feature work can move faster.

## 1) What this app is

**Profit Leak Attorney** is a competitive-intelligence audit system for local service businesses.

- The user submits business intake data in a web UI (`/new`).
- The server creates a `Case`, queues a long-running job, and returns a `jobId`.
- A separate worker performs multi-pass market research with Gemini + Google Search grounding, extracts structured competitor evidence, computes benchmark/strategy outputs, and writes a final report.
- The report is rendered at a share URL (`/r/:shareId`).

## 2) Runtime architecture

### Web app (Next.js App Router)

- Routes:
  - `GET /` redirects to `/new`
  - `GET /new` intake form
  - `GET /status/:jobId` polling status page
  - `GET /r/:shareId` report page
- API endpoints:
  - `POST /api/cases` create case from intake payload
  - `POST /api/cases/:id/run` create job and enqueue queue message
  - `GET /api/jobs/:id` return status/progress/shareId (if complete)
  - `GET /api/reports/:shareId` return report JSON

### Worker process

- Runs separately via `npm run worker`.
- Uses `pg-boss` against Postgres.
- Consumes `audit-job` messages with `{ caseId, jobId }`.
- Writes stage/progress updates and terminal status to `Job`.

### AI execution pipeline (inside worker)

1. **Research stage (6 passes)** using `gemini-3-flash-preview` + Google Search tool.
2. **Extraction stage** into strict JSON (`ExtractedDataSchema`) with retry/repair attempt.
3. **Benchmark stage** (`computeBenchmark`) for confidence, pattern flags, and leak estimates.
4. **Strategy stage** (`computeStrategicProfile`) from market delta-like signals.
5. **Composer stage** using `gemini-3-pro-preview` to produce final report JSON (`ReportSchema`).
6. **Persist** report with generated `shareId`, mark job completed.

## 3) Data model (Prisma)

### `Case`

- Business identity: `websiteUrl`, `location`, `whatTheySell`
- JSON fields: `vitals`, `proInputs`
- One-to-many with `Job` and `Report`

### `Job`

- Lifecycle: `status`, `stage`, `progress`, optional `error`
- Optional `payloadJson` for diagnostics/state snapshots
- Timestamps + relation to `Case`

### `Report`

- `shareId` unique public identifier
- `content` JSON payload of final report + metadata
- Relation to `Case`

## 4) Input and schema contracts

### Intake contract (`IntakeSchema`)

Required:

- `website_url`, `city`, `state_province`, `what_they_sell`
- `jobs_min/jobs_max`, `ticket_min/ticket_max`
- `availability` enum

Optional:

- `services[]`, `trip_fee`, `warranty`, `has_membership`, `has_priority`

Notes:

- API normalizes camelCase variants to snake_case for backward compatibility.

### Extracted data contract

- Competitors + evidence arrays with resilient defaults.
- Evidence type normalization maps noisy values to: `pricing|service|reputation|guarantee|other`.

### Report contract

- Strict top-level shape: verdict, market position, top leaks, scorecards, offer rebuild, scripts, next actions, assumptions ledger.
- Final persisted payload also includes system metadata and benchmark/strategy/evidence objects.

## 5) UX flow (happy path)

1. User submits intake on `/new`.
2. Frontend calls `POST /api/cases` then `POST /api/cases/:id/run`.
3. User is redirected to `/status/:jobId`.
4. Status page polls `/api/jobs/:id` every 2 seconds.
5. On completion, frontend redirects to `/r/:shareId`.
6. Report page renders business-facing summary, leak ranges, market position, top leaks, offer upgrades, and supporting evidence.

## 6) Operational dependencies

Environment variables:

- `DATABASE_URL` (PostgreSQL)
- `GEMINI_API_KEY`

Key libraries:

- Next.js 14, Prisma 5, pg-boss 9
- Google GenAI SDK (`@google/genai`)
- Zod + React Hook Form

## 7) Notable implementation details / caveats

- Worker has robust timeout wrappers, degraded-mode handling, and extraction retry before fallback.
- `Job.progress` is used as canonical status indicator for UI stage display.
- `GET /api/jobs/:id` currently picks the **first** report on case when multiple reports exist.
- `computeStrategicProfile` expects delta fields like `price_position` and `premium_signal_*`, while worker currently passes a minimal delta object; strategy output may default heavily unless aligned.
- Repository contains legacy/non-Next artifact files (`index.tsx`, `index.html`, `vite.config.ts`) that appear unused by the running Next app.

## 8) Suggested feature-planning checklist

Before implementing features, clarify:

- Should reports be versioned per job (1 report/job) instead of selecting first report by case?
- Should we compute and pass full market delta via `computeMarketDelta` (currently available in `lib/delta.ts`) to improve strategy quality?
- Should API expose richer job diagnostics (`payloadJson`) for debugging/replay?
- Should legacy Vite artifacts be removed to reduce confusion?
- Should report sections have explicit optional handling in UI to avoid empty-state overuse?

