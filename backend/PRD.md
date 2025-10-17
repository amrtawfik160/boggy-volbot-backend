## Solana Volume Bot Platform — Product Requirements Document (PRD)

### 1) Purpose & Scope

Transform the existing CLI-based Solana Volume Bot into a secure, multi-tenant web platform with a Next.js frontend and a NestJS backend powered by Supabase (Auth + Postgres), Bull queues, and Redis. The platform enables users to sign up, configure strategies/campaigns, manage wallets, and execute volume generation actions on Solana with real-time status, observability, and robust operational controls.

### 2) Goals and Non‑Goals

- **Goals**
  - **User onboarding & auth**: Email/password and OAuth via Supabase; session-based access with RBAC.
  - **Campaigns**: Create, schedule, and run volume generation campaigns for SPL tokens.
  - **Execution engine**: Queue-backed, horizontally scalable workers using Bull + Redis.
  - **Wallet management**: Securely register wallets; support Jito execution and legacy execution.
  - **Monitoring & logs**: Real-time progress, detailed execution logs, alerts, and webhooks.
  - **High availability**: Safe retries, idempotency, rate/concurrency controls, sane defaults.
  - **Re-use existing logic**: Migrate/port core logic from the current codebase (`executor/`, `services/`, `utils/`).
- **Non‑Goals (MVP)**
  - Built-in fiat billing/payments.
  - DEX-agnostic routing or complex strategy studio (beyond basic parameters).
  - Custody at exchange or MPC-based multi-party signing.

### 3) Personas

- **Trader/Marketer**: Sets up campaigns to stimulate on-chain volume and track progress.
- **Project Team**: Runs recurring campaigns for liquidity growth; monitors health and adjusts.
- **Admin**: Manages platform settings, abuse controls, and support operations.

### 4) Core Use Cases & User Stories

- As a user, I can sign up and verify my email to access the dashboard.
- As a user, I can register an SPL token mint and target pool for my campaign.
- As a user, I can add a wallet (custodial or connect-only) and test a dry run.
- As a user, I can configure campaign parameters (buy/sell cadence, slippage, size, jito tip).
- As a user, I can start/stop/pause a campaign and watch real-time status.
- As a user, I can view execution logs, errors, and aggregated results.
- As a user, I can receive notifications and/or webhooks on important events.
- As an admin, I can view system health, worker load, and audit logs.

### 5) Success Metrics

- Time-to-first-campaign < 5 minutes from sign-up.
- P95 API latency < 300 ms (non-execution endpoints).
- Job processing reliability > 99.9% with idempotent transaction handling.
- Error rate < 1% for well-formed jobs (excluding external RPC failures).

## Functional Requirements

### 6) Authentication & Authorization

- **Auth**: Supabase Auth for email/password and OAuth (Google/GitHub). Backend validates Supabase JWT.
- **RBAC**: Roles: `user`, `admin`. Optional organizations/workspaces (Phase 2).
- **Sessions**: Next.js uses Supabase client for session; API requires `Authorization: Bearer <token>`.
- **Security**: Enforce password policies, optional TOTP 2FA (Phase 2), device sessions, and refresh.

### 7) Wallet Management

- **Custodial wallets (MVP)**: Encrypted private keys at rest using application KMS secret; scoped per user.
- **Non-custodial (Phase 2)**: Connect Phantom/Wallet Adapter for read-only or signed session approvals.
- **Key storage**: AES-256-GCM with per-user data encryption key (DEK) encrypted by a master key (KEK).
- **Jito support**: Configure Jito keypair and tip parameters; allow per-campaign override.
- **Validation**: Verify ownership of address (signed message or on-chain proof) before enabling.

### 8) Tokens, Pools, and Configuration

- **Tokens**: Register SPL mint, symbol, decimals; optional metadata pulled from chain/indexers.
- **Pools**: Select target pool (e.g., Raydium) via `getPoolId`/`getPoolInfo`; cache in Redis.
- **Config**: Slippage, min/max tx size, target volume, schedule window, concurrency caps, RPC endpoints.
- **Guardrails**: Max slippage thresholds, blacklist/allowlist tokens, daily volume caps, pause-all switch.

### 9) Campaigns & Scheduling

- **Campaign**: A persistent entity describing goals and parameters.
- **Runs**: Each start creates a `campaign_run` linked to jobs and executions for auditability.
- **Scheduling**: Immediate start or cron-like scheduling; queue jobs (Bull) with backoff and jitter.
- **Pause/Resume/Stop**: User controls mapped to Bull job states; idempotent state transitions.

### 10) Execution Engine

- **Queues**: Bull (or BullMQ) with Redis. Queues: `gather`, `trade.buy`, `trade.sell`, `distribute`, `status`, `webhook`.
- **Workers**: Stateless NestJS workers consuming queues with configurable concurrency.
- **Idempotency**: Deterministic job keys, on-chain signature checks, and safe replays.
- **Retries**: Exponential backoff; dead-letter queue for manual intervention.
- **RPC**: Support multiple RPC endpoints with health checks and failover.
- **Existing logic reuse**: Port from `executor/jito.ts`, `executor/legacy.ts`, `services/*`, `utils/*` into NestJS modules/services.

### 11) Monitoring, Logs, and Notifications

- **Live status**: WebSocket/SSE channel for per-campaign updates and aggregate metrics.
- **Logs**: Structured JSON logs persisted to Postgres (summaries) and object storage (verbose), viewable in UI.
- **Metrics**: Per-queue depth, processing rate, success/failure counts, tx latency, RPC error rates.
- **Notifications**: Email (Supabase), webhooks; Phase 2: Slack/Discord webhooks.

### 12) Admin & Operations

- **Admin UI**: View system metrics, user campaigns, abuse flags, rate limits.
- **Abuse prevention**: Throttles, blacklists, suspicious activity alerts.
- **Feature flags**: Gradual rollout of new strategies and execution paths.

## Non‑Functional Requirements

### 13) Security

- **Secrets**: Environment-managed; never commit to VCS. Key rotation procedures.
- **Data**: Encrypt sensitive data at rest (wallet keys, API keys) and in transit (TLS).
- **Boundary**: Strict input validation; OWASP ASVS; SSRF and command injection mitigations.
- **Compliance**: Clear disclaimers; users attest to legal use; IP allowlists for high-risk actions.

### 14) Performance & Scalability

- Horizontal scale of workers; per-queue concurrency caps.
- Redis sizing for queue throughput; Postgres tuned for write-heavy logs.
- Caching: Pool info, token metadata; rate-limited indexer calls.

### 15) Availability & Reliability

- Health checks for API, workers, Redis, RPC providers.
- Graceful shutdown on deploys; in-flight job requeueing.
- Disaster recovery: Regular DB backups; Redis persistence configuration.

## Architecture

### 16) High-Level Components

- **Frontend**: Next.js (App Router) with Supabase client for auth; real-time via WebSocket/SSE.
- **Backend API**: NestJS REST (and WS gateway) verifying Supabase JWT; exposes campaign, wallet, status APIs.
- **Workers**: NestJS worker app(s) consuming Bull queues; leverage existing `services/` and `executor/` logic.
- **State**: Supabase Postgres (primary persistence), Redis (queues/cache), Supabase Storage (verbose logs/exports).
- **External**: Solana RPC providers; Jito relay for prioritized execution.

### 17) Recommended Repository Structure (Monorepo)

```
apps/
  web/           # Next.js frontend
  api/           # NestJS API
  workers/       # NestJS worker(s)
packages/
  core/          # Shared TS library: ported logic from current repo (executor, services, utils)
  types/         # Shared types
infra/
  docker/        # Dockerfiles, compose for local
  k8s/           # Manifests (optional)
```

### 18) Data Flow Overview

- User authenticates via Supabase; Next.js stores session.
- User creates campaign in UI; API validates and persists; enqueues jobs.
- Workers consume jobs, interact with Solana RPC/Jito, write logs and status to DB/Redis.
- UI subscribes to real-time status; users can pause/resume/stop; API maps to Bull operations.

## Data Model (Supabase / Postgres)

### 19) Entities (MVP)

- `profiles`
  - `id` (uuid, pk, references `auth.users.id`)
  - `email` (text, unique)
  - `role` (text: user|admin)
  - `created_at`, `updated_at`

- `wallets`
  - `id` (uuid, pk)
  - `user_id` (uuid, fk -> profiles.id)
  - `address` (text)
  - `encrypted_private_key` (bytea, nullable if non-custodial)
  - `label` (text)
  - `is_active` (boolean)
  - `created_at`, `updated_at`

- `tokens`
  - `id` (uuid, pk)
  - `mint` (text, unique)
  - `symbol` (text)
  - `decimals` (int)
  - `metadata` (jsonb)
  - `created_at`, `updated_at`

- `pools`
  - `id` (uuid, pk)
  - `token_id` (uuid, fk -> tokens.id)
  - `pool_address` (text)
  - `dex` (text)
  - `metadata` (jsonb)
  - `created_at`, `updated_at`

- `campaigns`
  - `id` (uuid, pk)
  - `user_id` (uuid, fk -> profiles.id)
  - `name` (text)
  - `token_id` (uuid, fk -> tokens.id)
  - `pool_id` (uuid, fk -> pools.id)
  - `params` (jsonb) // slippage, jito, sizing, schedule
  - `status` (text: draft|active|paused|stopped|completed)
  - `created_at`, `updated_at`

- `campaign_runs`
  - `id` (uuid, pk)
  - `campaign_id` (uuid, fk)
  - `started_at`, `ended_at`
  - `status` (text: running|paused|stopped|completed|failed)
  - `summary` (jsonb)

- `jobs`
  - `id` (uuid, pk)
  - `run_id` (uuid, fk -> campaign_runs.id)
  - `queue` (text)
  - `type` (text)
  - `payload` (jsonb)
  - `status` (text: queued|processing|succeeded|failed|cancelled)
  - `attempts` (int)
  - `error` (jsonb)
  - `created_at`, `updated_at`

- `executions`
  - `id` (uuid, pk)
  - `job_id` (uuid, fk -> jobs.id)
  - `tx_signature` (text)
  - `latency_ms` (int)
  - `result` (jsonb)
  - `created_at`

- `audit_logs`
  - `id` (uuid, pk)
  - `user_id` (uuid)
  - `action` (text)
  - `entity` (text)
  - `entity_id` (uuid)
  - `metadata` (jsonb)
  - `created_at`

- `webhooks`
  - `id` (uuid, pk)
  - `user_id` (uuid)
  - `url` (text)
  - `events` (text[])
  - `secret` (text)
  - `is_active` (boolean)
  - `created_at`, `updated_at`

### 20) Indexing & Constraints

- Unique indexes on `tokens.mint`, `wallets (user_id, address)`.
- Partial indexes on `jobs.status`, `executions.tx_signature`.
- FKs with `ON DELETE CASCADE` where appropriate (e.g., campaign -> runs -> jobs -> executions).

## API Contract (NestJS)

### 21) Authentication

- Supabase JWT required for protected endpoints via `Authorization: Bearer <token>`.
- Rate limiting per IP and per user; strict CORS policies for `apps/web` origin(s).

### 22) Endpoints (MVP)

- `GET /v1/me` — current user profile
- `GET /v1/tokens` — list user tokens; `POST /v1/tokens` — register token mint
- `GET /v1/pools` — discover/select pools for mint
- `GET /v1/wallets` — list; `POST /v1/wallets` — add wallet; `DELETE /v1/wallets/:id`
- `GET /v1/campaigns` — list; `POST /v1/campaigns` — create; `GET /v1/campaigns/:id`
- `POST /v1/campaigns/:id/start` — start run; `POST /v1/campaigns/:id/pause`; `POST /v1/campaigns/:id/stop`
- `GET /v1/campaigns/:id/status` — live status/summary
- `GET /v1/campaigns/:id/logs` — paginated logs
- `POST /v1/webhooks` — create; `GET /v1/webhooks` — list; `POST /v1/webhooks/test`

### 23) WebSocket/SSE

- Channel per `campaign_id` for live job updates, aggregated stats, and run lifecycle events.

## Frontend (Next.js)

### 24) Pages & Screens (MVP)

- **Auth**: Sign in/up, password reset (Supabase UI or custom forms).
- **Dashboard**: Summary cards (active campaigns, 24h volume, success rate), system notices.
- **Tokens & Pools**: Register mint, view pool candidates, select target pool.
- **Wallets**: Add/manage wallets, verify ownership, activity feed.
- **Campaigns**: List, create wizard, detail view with live status and controls.
- **Logs & Metrics**: Streamed logs, filters, export CSV.
- **Settings**: Profile, API keys (Phase 2), notifications, webhooks.

### 25) UX/Interaction

- Inline validation and guardrails for risky parameters (e.g., slippage > threshold).
- Confirmation prompts for start/stop actions.
- Toasts for job enqueued, errors, and webhook tests.
- Dark/light themes; responsive layout.

## Queues & Workers (Bull + Redis)

### 26) Queues

- `gather`: Fetch pool info, balances, pre-flight checks.
- `trade.buy` / `trade.sell`: Place market/AMM trades using existing logic.
- `distribute`: Spread orders over time and wallets according to strategy.
- `status`: Periodic aggregation of run metrics and health checks.
- `webhook`: Deliver event payloads with retries and signing.

### 27) Worker Policies

- **Concurrency**: Configurable per queue; sane defaults (e.g., 5–20) with caps.
- **Backoff**: Exponential (e.g., 2^attempt \* base), max attempts 5–8.
- **Idempotency**: Job keys include `run_id` and deterministic nonce/sequence.
- **Observability**: Metrics exported; traces for RPC operations.

## Migration & Reuse of Existing Code

### 28) Porting Plan

- Extract reusable logic from:
  - `executor/jito.ts`, `executor/legacy.ts`
  - `services/trading-service.ts`, `services/distribution-service.ts`
  - `utils/*` (pool discovery, swaps, logger, errors)
- Move into `packages/core` with clean interfaces and no CLI-specific I/O.
- Wrap with NestJS providers/services (API + workers) and typed DTOs.

## Delivery Plan

### 29) Phases & Milestones

- **Phase 0 — Foundations (1–2 weeks)**
  - Monorepo scaffold (apps: web/api/workers; packages: core/types)
  - Supabase project setup; Redis; Docker Compose for local
  - Auth wiring (Supabase) and NestJS JWT guard

- **Phase 1 — MVP (2–4 weeks)**
  - Wallets (custodial), Tokens, Pools flows
  - Campaign create/start/stop; basic status; buy/sell jobs; Jito support
  - Logs and minimal metrics; webhooks; admin seeds

- **Phase 2 — Hardening (2–3 weeks)**
  - Pause/resume; schedules; better guardrails; retries/backoff tuning
  - Observability (traces/metrics dashboards), error budgets, rate limits
  - Non-custodial wallet connections; notifications integrations

### 30) Acceptance Criteria (MVP)

- Users can sign up/sign in and create a campaign tied to a registered token/pool.
- Campaign can start/stop; jobs execute with visible progress and logs.
- Redis queues process jobs reliably with retries and idempotency.
- Jito execution works when enabled; legacy execution is available.
- Admin can observe queue depths and major health indicators.

## Environments & DevOps

### 31) Environments

- **Local**: Docker Compose (Next.js, Nest API, Workers, Redis); Supabase hosted or local.
- **Staging**: Managed Redis; Supabase project; CI deploy with seed data.
- **Prod**: HA Redis; Supabase; horizontally scaled workers; secure secrets management.

### 32) CI/CD

- Lint, type-check, test; build; containerize; deploy via pipelines.
- Migrations with Prisma/SQL; automated roll-forward/rollback.

### 33) Observability

- Centralized logs; error tracking (e.g., Sentry); metrics (queue, RPC, tx latency); uptime checks.

## Risks & Mitigations

### 34) Key Risks

- Custodial key storage risk — mitigate with encryption, access controls, and optional non-custodial path.
- RPC instability — multi-provider failover and adaptive backoff.
- Market impact and ethics — disclaimers, rate/volume guardrails, admin oversight.

## Open Questions

- Scope of non-custodial signing for automated flows in MVP?
- Required DEX support beyond current `swapOnlyAmm` logic?
- Billing model and limits per user/tenant?

## Appendix

### 35) Environment Variables (illustrative)

```env
# Common
NODE_ENV=development

# API
API_PORT=3001
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Redis / Bull
REDIS_URL=redis://localhost:6379

# Jito / Solana
JITO_KEYPAIR_JSON=...
SOLANA_RPC_PRIMARY=...
SOLANA_RPC_FALLBACK=...

# Crypto
MASTER_KEY_KMS_OR_PLAINTEXT=...
```

### 36) References

- Next.js: [nextjs.org](https://nextjs.org)
- NestJS: [nestjs.com](https://nestjs.com)
- Supabase: [supabase.com](https://supabase.com)
- BullMQ: [docs.bullmq.io](https://docs.bullmq.io)
