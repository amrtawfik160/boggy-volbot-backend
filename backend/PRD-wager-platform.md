## Web3 Wagering Platform (Esports, Sports, Custom Contracts) — Product Requirements Document (PRD)

### 1) Purpose & Scope

Build a secure, scalable Web3 wagering platform that enables peer-to-peer esports wagers, sportsbook-style bets on professional sports, and flexible custom-contract wagers, all backed by smart-contract escrow, hybrid verification (manual + automated), and an operations-grade admin dashboard.

### 2) Goals and Non‑Goals

-   **Goals**
    -   **Esports P2P**: Create/join wagers for head-to-head and tournaments; escrow on-chain; winner gets paid.
    -   **Sportsbook**: Place bets on official sports events; automated result settlement via data oracles.
    -   **Custom Contracts**: User-defined terms (e.g., weight loss challenge) with manual arbitration.
    -   **Trust & Safety**: Disputes, evidence submission, audit trails, and configurable limits.
    -   **Monetization**: 3% platform fee; referral system.
    -   **Compliance UX**: Geofencing, disclaimers, configurable KYC/age gates per jurisdiction.
-   **Non‑Goals (MVP)**
    -   On-chain fully decentralized governance (DAO voting) for disputes.
    -   Multi-chain deployments beyond the primary chain (Phase 2+).
    -   Advanced market-making or complex parlay builder (post-MVP).

### 3) Personas

-   **Competitive Gamer**: Creates/joins P2P wagers; needs fast payout and fair verification.
-   **Sports Bettor**: Places bets on pro events; expects official results and quick settlement.
-   **Casual Challenger**: Uses custom contracts for friendly wagers with clear escrow.
-   **Moderator/Arbitrator**: Reviews proof, resolves disputes, manages integrity.
-   **Admin/Ops**: Configures fees/limits, monitors system health, handles escalations.

### 4) Product Pillars

-   **Fairness**: Escrowed funds, clear rules, verifiable results, dispute resolution.
-   **Speed**: Low-fee chain, near-instant payouts after verification.
-   **Coverage**: Works for esports with or without public APIs, sports via oracles, and arbitrary custom bets.
-   **Safety**: Rate limits, anti-abuse, geofencing, audit logs.

---

## 5) Core User Flows

### 5.1 Esports P2P Wager (Head-to-Head)

1. Connect wallet; link game account (when applicable).
2. Create wager: select game (Fortnite, LoL, Valorant, PUBG, etc.), stake (min/max), match rules (public/private).
3. Opponent accepts; both stakes are escrowed on-chain.
4. Match is played off-platform.
5. Verification:
    - Manual: both upload proof; moderator declares winner.
    - Automated (where available): fetch from game APIs (e.g., Riot) and auto-resolve.
6. Smart contract pays winner (97%) and platform fee (3%); close wager.

### 5.2 Sports Betting (Official Events)

1. Browse markets (boxing, MMA, basketball, football, etc.).
2. Select outcome and stake; funds escrowed.
3. At event end, oracle posts official result on-chain.
4. Contract calculates payouts and settles automatically; fee deducted.

### 5.3 Custom Contract (Manual Arbitration)

1. Two parties define terms (e.g., “First to lose 10 lbs in 30 days”).
2. Both deposit stakes; contract stores terms reference (hash; details off-chain/IPFS).
3. After deadline, both submit evidence.
4. Arbitrator (platform or designated) selects winner; contract releases funds (97/3 split).

### 5.4 Disputes

-   Parties can open dispute within a set window; payout is frozen.
-   Moderator reviews evidence, may request more info, and decides outcome.
-   Decision is final; contract executes payout.

### 5.5 Referral System

-   Users generate referral links.
-   On referred user’s first completed wager(s), referrer earns a configurable % (off fee or volume) credited on-chain or off-chain balance.

---

## 6) Functional Requirements

### 6.1 Wallet & Identity

-   Support Solana wallets (Phantom, Solflare) via wallet adapter.
-   Optional account linking for specific games (Riot PUUID for LoL/Valorant).
-   Optional KYC/age gate toggles per jurisdiction (admin-configurable; Phase 2).

### 6.2 Wager Creation & Escrow

-   Create Public/Private wagers; invite by wallet or lobbies.
-   Stake limits, timeouts, cancellation rules (auto-refund if not accepted).
-   On accept, both stakes are transferred to escrow program account.

### 6.3 Verification

-   Manual proof: screenshot/video upload; tamper-evident storage (e.g., IPFS/Arweave).
-   Automated verification for supported titles via official/partner APIs (e.g., Riot Games) when available; fallback to manual.
-   Sports: automated via oracle feeds (e.g., Chainlink Functions/CCIP with third-party APIs).

### 6.4 Fees & Payouts

-   3% platform fee on settlement; routed to treasury wallet.
-   Winner receives 97% of pot; configurable per product line in admin.
-   Referral rewards are tracked and claimable (settlement or periodic distribution).

### 6.5 Notifications & Messaging

-   Email/push (Phase 2) and in-app notifications for accepts, submissions, disputes, settlements.

### 6.6 Content & Market Management (Sports)

-   Ingest sports events/markets; enable/disable markets; suspend on anomalies.
-   Configure settlement sources and fallback rules.

---

## 7) Admin Dashboard (Operations)

### 7.1 Overview

-   KPIs: DAU, wagers created/settled, fee revenue, dispute rate, average settlement time.
-   System health: queue depths, worker status, oracle latency, error rates.

### 7.2 Wager Moderation (Esports & Custom)

-   Proof review queue: side-by-side evidence for both parties, metadata, timestamps.
-   Actions: approve winner, reject evidence, request resubmission, escalate.
-   Dispute management: open/resolve disputes, add admin notes, timeline view.

### 7.3 Sportsbook Operations

-   Event/market list: status (open/suspended/settled), liquidity, exposure.
-   Manual overrides: suspend market, void bets, force settle (with audit log).
-   Oracle status: recent result pulls, failures, fallback usage.

### 7.4 Risk, Limits, and Compliance

-   User limits: max stake, daily volume, cooldowns; blacklists/allowlists.
-   Geofencing rules, age gating, KYC flags (if enabled); content disclaimers.
-   Fraud/abuse signals: duplicate evidence, rapid disputes, correlated wallets.

### 7.5 Treasury & Fees

-   Fee configuration per product (esports/sports/custom), referral %, treasury wallets.
-   Payout ledger, fee accruals, scheduled withdrawals, CSV exports.

### 7.6 Referral Management

-   Referrer tree, earnings, statuses; approve/deny adjustments; export.

### 7.7 Auditing & Logs

-   Immutable audit log of admin actions; user-facing appeal notes.
-   Advanced search, filters, and export.

---

## 8) Technical Architecture

### 8.1 High-Level Components

-   **Frontend**: Next.js (App Router), wallet adapter, real-time updates (WS/SSE).
-   **Backend API**: NestJS for REST/WebSocket; auth, rate limiting, business rules.
-   **Workers**: Queue consumers for verification, oracle polling, settlements, notifications.
-   **Smart Contracts**: Solana (Anchor) programs for escrow, markets, settlement, and referrals.
-   **Storage**: Postgres for core data; object storage/IPFS for media evidence.
-   **Oracles**: Chainlink Functions/CCIP or managed services to post results on-chain.

### 8.2 Smart Contract Modules (Solana/Anchor)

-   **Escrow Program**
    -   Create wager: records participants, stake, rules hash, expiry.
    -   Accept wager: second party deposits; state → Active.
    -   Resolve: callable by authorized resolver (backend/oracle/admin multisig/arbitrator); pays winner (97%) and fee (3%).
    -   Dispute flag: freezes funds until resolution.
-   **Sports Market Program**
    -   Markets (events/outcomes) with open/close times, odds model (MVP: pool-based split).
    -   Bets recorded per wallet; settlement based on oracle result.
-   **Referral Program**
    -   Tracks referrer for each wallet; accrues rewards; claim/settle functions.
-   **Access Control**
    -   Admin/resolver authorities and upgradeability policy (via multisig).

### 8.3 Oracles & Verification

-   **Sports**: Chainlink Functions calling providers like TheRundown, Sportradar, or similar; fallback with manual admin settlement.
-   **Esports**: Off-chain workers call Riot Games APIs for LoL/Valorant; unsupported titles use manual review.
-   **Custom**: Manual arbitration only; store decision and settle.

### 8.4 Backend Services

-   AuthN/AuthZ, rate limiting, anti-abuse.
-   Wager lifecycle APIs, evidence intake, dispute handling.
-   Sports ingestion (events/markets), oracle posting, settlement reconciliation.
-   Admin APIs for moderation, risk, treasury, and audit logs.

---

## 9) Data Model (Entities)

-   `users` (id, email, wallet_address, referrer_id, role, flags, created_at)
-   `game_accounts` (id, user_id, game, username, puuid, platform, verified, verified_at)
-   `wagers` (id, type: esports|custom, creator_id, opponent_id, game, terms_ref, stake_amount, status, winner_id, escrow_tx, created_at, settled_at)
-   `wager_proofs` (id, wager_id, user_id, evidence_url, evidence_type, metadata, submitted_at)
-   `disputes` (id, wager_id, opened_by, reason, status, admin_notes, resolved_by, resolved_at)
-   `sports_events` (id, league, event_ref, start_time, status, metadata)
-   `sports_markets` (id, event_id, market_type, status, oracle_source, metadata)
-   `bets` (id, market_id, user_id, outcome, stake_amount, status, payout_amount, settled_at)
-   `referrals` (id, referrer_id, referee_id, status, reward_amount, awarded_at)
-   `fees_ledger` (id, source_ref, product, amount, tx_ref, created_at)
-   `admin_audit_logs` (id, admin_id, action, subject_type, subject_id, notes, created_at)

Indexes and FKs applied for performance and integrity (e.g., wagers.status, bets.status, foreign keys with cascade where appropriate). Evidence stored off-chain with content-addressed URLs.

---

## 10) API Contract (Illustrative)

### Public (Auth required)

-   `POST /v1/wagers` — create esports/custom wager
-   `POST /v1/wagers/:id/accept` — accept wager
-   `POST /v1/wagers/:id/proofs` — submit evidence
-   `POST /v1/wagers/:id/dispute` — open dispute
-   `GET /v1/wagers/:id` — status/details
-   `GET /v1/sports/events` — list events/markets
-   `POST /v1/sports/bets` — place sports bet
-   `GET /v1/referrals` — referral stats

### Admin

-   `GET /admin/moderation/proofs` — review queue
-   `POST /admin/wagers/:id/resolve` — declare winner
-   `POST /admin/wagers/:id/void` — void wager (edge cases)
-   `POST /admin/markets/:id/suspend|settle` — market controls
-   `GET /admin/metrics` — KPIs, queues, oracle health
-   `POST /admin/config/fees` — set fees/referral %

Auth: JWT + role-based access; sensitive admin routes behind IP allowlist and 2FA (Phase 2).

---

## 11) Non‑Functional Requirements

### Security

-   Smart contracts audited; minimal trusted roles; multisig for admin keys.
-   Backend: input validation, SSRF/SQLi protection, object storage signed URLs, evidence redaction.
-   Rate limiting, replay protection, signature verification for wallet actions.

### Compliance & Policy

-   Geofencing and age gating where required; clear disclaimers and responsible betting guidelines.
-   Data retention policy for evidence and disputes.

### Performance & Availability

-   P95 API latency < 300 ms (non-oracle endpoints); settlement within minutes post-verification.
-   Workers horizontally scalable; queues with backoff and DLQs.
-   Uptime targets 99.9% for core APIs.

---

## 12) UX/Frontend (Next.js)

-   **Esports**: Games list, “Wager Now”, create/accept flows, proof upload, dispute UI.
-   **Sportsbook**: Browse events/markets, betslip, open bets, results history.
-   **Custom**: Contract builder with templates, evidence checklist, arbitrator selection (Phase 2 option).
-   **Wallet**: Connect Phantom/Solflare, balance display, transaction statuses.
-   **Notifications**: In-app toasts, inbox; Phase 2 email/push.
-   **Admin**: Dedicated dashboard app/section with moderation queues and controls.

---

## 13) Delivery Plan

### Phase 0 — Foundations (1–2 weeks)

-   Repo scaffold, envs, wallet connect, base UI setup; Solana program skeletons; CI/CD.

### Phase 1 — Esports MVP (3–5 weeks)

-   P2P wagers with escrow, manual verification, disputes, basic admin moderation, 3% fee.

### Phase 2 — Sportsbook MVP (2–4 weeks)

-   Event ingestion, bet placement, oracle settlement, market admin, exposure views.

### Phase 3 — Custom Contracts (2–3 weeks)

-   Contract builder, arbitration workflow, evidence storage, admin decisions.

### Phase 4 — Hardening & Growth (2–4 weeks)

-   Referral program, risk/limits, observability, geofencing/age gates, KYC toggle, analytics.

---

## 14) Acceptance Criteria (MVP)

-   Users can create/accept an esports wager, submit proofs, and receive payout post-verification.
-   Admins can review proofs, resolve disputes, and settle wagers; fee accrues correctly.
-   Sportsbook: users can place bets and receive automated settlement for at least one league.
-   Custom contracts: users can define terms and settle via admin arbitration.
-   Audit logs capture all admin actions; referral accrual works for first-order referrals.

---

## 15) Open Questions

-   Exact jurisdictions to geofence? KYC/age thresholds at launch?
-   Target chain(s) beyond Solana and USDC? Native token incentives?
-   Automated verification priorities: LoL/Valorant at launch, others later?
-   Referral payout basis: % of fee vs % of volume; lifetime vs limited window?

---

## 16) References

-   Riot Games Developer Portal (LoL/Valorant APIs): [developer.riotgames.com](https://developer.riotgames.com/)
-   Chainlink (Functions/CCIP) for sports data settlement: [chain.link](https://chain.link/)
-   TheRundown Sports Odds API: [therundown.io](https://therundown.io/)
-   Pandascore Esports Data: [pandascore.co](https://pandascore.co/)
-   Abios Esports Data: [abiosgaming.com](https://abiosgaming.com/)
