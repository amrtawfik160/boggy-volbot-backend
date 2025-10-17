# System Architecture Documentation

This document provides a comprehensive overview of the Solana Volume Bot system architecture, including component diagrams, data flows, and design decisions.

## Table of Contents

- [System Overview](#system-overview)
- [High-Level Architecture](#high-level-architecture)
- [Component Architecture](#component-architecture)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Database Schema](#database-schema)
- [Queue Architecture](#queue-architecture)
- [Security Architecture](#security-architecture)
- [Deployment Architecture](#deployment-architecture)

---

## System Overview

The Solana Volume Bot is a distributed system designed to automate trading campaigns on the Solana blockchain. It consists of:

- **API Service**: REST API for managing campaigns, wallets, and tokens
- **Worker Service**: Background job processors for executing trading operations
- **Redis**: Job queue and caching layer
- **Supabase**: Database (PostgreSQL) and authentication
- **Solana RPC**: Blockchain interaction via RPC providers

**Key Features:**
- Campaign-based trading automation
- Wallet and token management
- Distributed job processing
- Real-time monitoring and metrics
- Admin controls and overrides
- Rate limiting and throttling

---

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        FE[Frontend/CLI Client]
    end

    subgraph "API Layer"
        API[NestJS API Service]
        AUTH[Auth Middleware]
        GUARD[Admin Guard]
    end

    subgraph "Queue Layer"
        REDIS[(Redis)]
        QUEUE[BullMQ Queues]
    end

    subgraph "Worker Layer"
        W1[Worker 1]
        W2[Worker 2]
        WN[Worker N]
    end

    subgraph "Data Layer"
        DB[(Supabase PostgreSQL)]
        STORAGE[Supabase Storage]
    end

    subgraph "Blockchain Layer"
        RPC1[RPC Provider 1]
        RPC2[RPC Provider 2]
        JITO[Jito Block Engine]
        SOLANA[Solana Blockchain]
    end

    subgraph "Observability Layer"
        SENTRY[Sentry Error Tracking]
        OTEL[OpenTelemetry Traces]
        LOGS[Structured Logs]
    end

    FE -->|HTTPS| API
    API -->|Authenticate| AUTH
    API -->|Authorize| GUARD
    API -->|Read/Write| DB
    API -->|Enqueue Jobs| QUEUE

    QUEUE -->|Store| REDIS

    W1 & W2 & WN -->|Poll Jobs| QUEUE
    W1 & W2 & WN -->|Read/Write| DB
    W1 & W2 & WN -->|Send Transactions| RPC1
    W1 & W2 & WN -->|Fallback| RPC2
    W1 & W2 & WN -->|MEV Protection| JITO

    RPC1 & RPC2 & JITO -->|Submit| SOLANA

    API & W1 & W2 & WN -.->|Errors| SENTRY
    API & W1 & W2 & WN -.->|Traces| OTEL
    API & W1 & W2 & WN -.->|Logs| LOGS
```

---

## Component Architecture

### API Service Architecture

```mermaid
graph TB
    subgraph "NestJS API Application"
        MAIN[Main.ts Bootstrap]

        subgraph "Core Modules"
            APP[App Module]
            AUTH_MOD[Auth Module]
            METRICS_MOD[Metrics Module]
            SENTRY_MOD[Sentry Module]
        end

        subgraph "Feature Modules"
            CAMP[Campaigns Module]
            WALLET[Wallets Module]
            TOKEN[Tokens Module]
            SETTINGS[Settings Module]
            ADMIN[Admin Module]
        end

        subgraph "Controllers"
            CAMP_CTRL[Campaigns Controller]
            WALLET_CTRL[Wallets Controller]
            TOKEN_CTRL[Tokens Controller]
            ADMIN_CTRL[Admin Controller]
            HEALTH[Health Controller]
        end

        subgraph "Services"
            CAMP_SVC[Campaign Service]
            WALLET_SVC[Wallet Service]
            TOKEN_SVC[Token Service]
            METRICS_SVC[Metrics Service]
            QUEUE_SVC[Queue Service]
        end

        subgraph "Guards & Middleware"
            JWT_GUARD[JWT Auth Guard]
            ADMIN_GUARD[Admin Guard]
            RATE_LIMIT[Rate Limit]
            LOGGING[Request Logging]
        end

        subgraph "Infrastructure"
            SUPABASE[Supabase Client]
            REDIS_CLIENT[Redis Client]
            BULL_BOARD[Bull Dashboard]
        end
    end

    MAIN --> APP
    APP --> AUTH_MOD & METRICS_MOD & SENTRY_MOD
    APP --> CAMP & WALLET & TOKEN & SETTINGS & ADMIN

    CAMP --> CAMP_CTRL --> CAMP_SVC
    WALLET --> WALLET_CTRL --> WALLET_SVC
    TOKEN --> TOKEN_CTRL --> TOKEN_SVC
    ADMIN --> ADMIN_CTRL --> METRICS_SVC

    CAMP_SVC & WALLET_SVC & TOKEN_SVC --> QUEUE_SVC
    QUEUE_SVC --> REDIS_CLIENT

    CAMP_CTRL & WALLET_CTRL & TOKEN_CTRL --> JWT_GUARD
    ADMIN_CTRL --> ADMIN_GUARD

    JWT_GUARD & ADMIN_GUARD --> SUPABASE
    CAMP_SVC & WALLET_SVC & TOKEN_SVC --> SUPABASE
```

### Worker Service Architecture

```mermaid
graph TB
    subgraph "Worker Application"
        WORKER_MAIN[Worker Bootstrap]

        subgraph "Job Processors"
            CAMP_PROC[Campaign Processor]
            TX_PROC[Transaction Processor]
            DIST_PROC[Distribution Processor]
            STATUS_PROC[Status Aggregator]
        end

        subgraph "Services"
            SOLANA_SVC[Solana Service]
            WALLET_SVC[Wallet Service]
            ENCRYPT_SVC[Encryption Service]
            METRICS_SVC[Metrics Service]
        end

        subgraph "Infrastructure"
            REDIS_CLIENT[Redis Client]
            SUPABASE[Supabase Client]
            RPC_POOL[RPC Connection Pool]
        end
    end

    WORKER_MAIN --> CAMP_PROC & TX_PROC & DIST_PROC & STATUS_PROC

    CAMP_PROC --> SOLANA_SVC & WALLET_SVC
    TX_PROC --> SOLANA_SVC
    DIST_PROC --> SOLANA_SVC & WALLET_SVC

    SOLANA_SVC --> RPC_POOL
    WALLET_SVC --> ENCRYPT_SVC

    CAMP_PROC & TX_PROC & DIST_PROC --> SUPABASE
    CAMP_PROC & TX_PROC & DIST_PROC --> REDIS_CLIENT

    STATUS_PROC --> SUPABASE & REDIS_CLIENT
```

---

## Data Flow Diagrams

### Campaign Creation Flow

```mermaid
sequenceDiagram
    actor User
    participant API
    participant Auth
    participant DB
    participant Queue
    participant Worker

    User->>API: POST /v1/campaigns
    API->>Auth: Validate JWT
    Auth-->>API: User authenticated

    API->>API: Validate request body
    API->>DB: Check wallet exists
    DB-->>API: Wallet found

    API->>DB: Check token exists
    DB-->>API: Token found

    API->>DB: Create campaign record
    DB-->>API: Campaign created (ID: 123)

    API->>Queue: Enqueue campaign-start job
    Queue-->>API: Job enqueued

    API-->>User: 201 Created (campaign details)

    Worker->>Queue: Poll for jobs
    Queue-->>Worker: campaign-start job

    Worker->>DB: Load campaign config
    DB-->>Worker: Campaign data

    Worker->>Worker: Generate trading schedule
    Worker->>Queue: Enqueue buy/sell jobs

    Worker->>DB: Update campaign status
    DB-->>Worker: Status updated
```

### Transaction Execution Flow

```mermaid
sequenceDiagram
    participant Queue
    participant Worker
    participant DB
    participant Encrypt
    participant RPC
    participant Jito
    participant Solana

    Queue->>Worker: execute-buy job

    Worker->>DB: Load wallet data
    DB-->>Worker: Encrypted private key

    Worker->>Encrypt: Decrypt private key
    Encrypt-->>Worker: Plaintext keypair

    Worker->>DB: Load token config
    DB-->>Worker: Token mint address

    Worker->>Worker: Build transaction
    Worker->>Worker: Sign transaction

    alt Jito enabled
        Worker->>Jito: Submit bundle
        Jito-->>Worker: Bundle ID
        Jito->>Solana: Submit to blockchain
    else Direct RPC
        Worker->>RPC: sendTransaction
        RPC-->>Worker: Signature
        RPC->>Solana: Submit to blockchain
    end

    Solana-->>RPC: Confirmation
    RPC-->>Worker: Transaction confirmed

    Worker->>DB: Record transaction
    DB-->>Worker: Transaction saved

    Worker->>DB: Update campaign stats
    DB-->>Worker: Stats updated

    Worker->>Queue: Job completed
```

### Wallet Distribution Flow

```mermaid
sequenceDiagram
    actor User
    participant API
    participant Queue
    participant Worker
    participant Solana
    participant DB

    User->>API: POST /v1/campaigns/:id/start
    API->>DB: Get campaign config
    DB-->>API: Config (distribute_wallet_num: 5)

    API->>Queue: Enqueue distribute-sol job
    Queue-->>API: Job enqueued

    Worker->>Queue: Poll jobs
    Queue-->>Worker: distribute-sol job

    Worker->>DB: Load main wallet
    DB-->>Worker: Main wallet keypair

    Worker->>DB: Check if sub-wallets exist
    DB-->>Worker: No sub-wallets

    loop Create 5 sub-wallets
        Worker->>Worker: Generate new keypair
        Worker->>DB: Save encrypted keypair
        DB-->>Worker: Wallet created
    end

    Worker->>Worker: Calculate SOL per wallet

    loop Distribute to 5 sub-wallets
        Worker->>Solana: Transfer SOL
        Solana-->>Worker: Transaction confirmed
        Worker->>DB: Record transfer
    end

    Worker->>DB: Update campaign status
    DB-->>Worker: Status: active

    Worker->>Queue: Job completed
```

### Real-Time Metrics Flow

```mermaid
sequenceDiagram
    actor Admin
    participant API
    participant Redis
    participant DB
    participant Worker

    Admin->>API: GET /v1/admin/metrics/system
    API->>API: Check admin role

    par API Metrics
        API->>API: Collect process metrics
        API-->>API: CPU, Memory, Uptime
    and Database Metrics
        API->>DB: Health check query
        DB-->>API: Response time
    and Redis Metrics
        API->>Redis: INFO command
        Redis-->>API: Memory, clients
    and Queue Metrics
        API->>Redis: Get queue counts
        Redis-->>API: Waiting, active, failed
    end

    API->>API: Aggregate metrics
    API-->>Admin: Metrics response

    Note over Worker: Background status aggregator (every 15s)

    loop Every 15 seconds
        Worker->>DB: Query active campaigns
        DB-->>Worker: Campaign list

        loop For each campaign
            Worker->>DB: Count transactions
            Worker->>DB: Calculate success rate
            Worker->>DB: Update campaign stats
        end

        Worker->>Redis: Cache aggregated stats
    end
```

---

## Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ campaigns : creates
    users ||--o{ wallets : owns
    users ||--o{ tokens : manages
    users ||--o{ user_settings : has
    users ||--o{ audit_logs : generates

    wallets ||--o{ campaigns : funds
    tokens ||--o{ campaigns : trades

    campaigns ||--o{ transactions : executes
    campaigns ||--o{ campaign_stats : tracks

    users {
        uuid id PK
        string email UK
        string role
        timestamp created_at
    }

    wallets {
        uuid id PK
        uuid user_id FK
        string name
        string encrypted_private_key
        string public_key UK
        decimal balance
        timestamp created_at
    }

    tokens {
        uuid id PK
        uuid user_id FK
        string name
        string mint_address UK
        string symbol
        jsonb metadata
        timestamp created_at
    }

    campaigns {
        uuid id PK
        uuid user_id FK
        uuid wallet_id FK
        uuid token_id FK
        string status
        jsonb config
        timestamp started_at
        timestamp ended_at
        timestamp created_at
    }

    transactions {
        uuid id PK
        uuid campaign_id FK
        string signature UK
        string type
        decimal amount
        string status
        jsonb metadata
        timestamp created_at
    }

    campaign_stats {
        uuid id PK
        uuid campaign_id FK
        integer total_transactions
        integer successful_transactions
        decimal volume_generated
        timestamp updated_at
    }

    user_settings {
        uuid id PK
        uuid user_id FK
        jsonb preferences
        timestamp updated_at
    }

    audit_logs {
        uuid id PK
        uuid user_id FK
        string action
        jsonb details
        timestamp created_at
    }
```

### Key Tables

#### campaigns
```sql
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    token_id UUID NOT NULL REFERENCES tokens(id),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    config JSONB NOT NULL,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_started_at ON campaigns(started_at);
```

#### transactions
```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    signature VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(20, 9) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    metadata JSONB,
    confirmed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transactions_campaign_id ON transactions(campaign_id);
CREATE INDEX idx_transactions_signature ON transactions(signature);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
```

---

## Queue Architecture

### BullMQ Queue Structure

```mermaid
graph LR
    subgraph "Redis Queues"
        subgraph "campaign-executor"
            CE_WAIT[Waiting]
            CE_ACTIVE[Active]
            CE_COMPLETED[Completed]
            CE_FAILED[Failed]
        end

        subgraph "transaction-processor"
            TP_WAIT[Waiting]
            TP_ACTIVE[Active]
            TP_COMPLETED[Completed]
            TP_FAILED[Failed]
        end

        subgraph "wallet-distribution"
            WD_WAIT[Waiting]
            WD_ACTIVE[Active]
            WD_COMPLETED[Completed]
            WD_FAILED[Failed]
        end
    end

    CE_WAIT --> CE_ACTIVE
    CE_ACTIVE --> CE_COMPLETED
    CE_ACTIVE --> CE_FAILED
    CE_FAILED -.->|Retry| CE_WAIT

    TP_WAIT --> TP_ACTIVE
    TP_ACTIVE --> TP_COMPLETED
    TP_ACTIVE --> TP_FAILED
    TP_FAILED -.->|Retry| TP_WAIT

    WD_WAIT --> WD_ACTIVE
    WD_ACTIVE --> WD_COMPLETED
    WD_ACTIVE --> WD_FAILED
    WD_FAILED -.->|Retry| WD_WAIT
```

### Queue Configuration

**Queue: campaign-executor**
- **Purpose**: Orchestrate campaign execution
- **Concurrency**: 5 per worker
- **Priority**: High
- **Retry Strategy**: 3 attempts with exponential backoff
- **Job Timeout**: 5 minutes

**Queue: transaction-processor**
- **Purpose**: Execute buy/sell transactions
- **Concurrency**: 10 per worker
- **Priority**: Normal
- **Retry Strategy**: 5 attempts with exponential backoff
- **Job Timeout**: 2 minutes

**Queue: wallet-distribution**
- **Purpose**: Distribute SOL to sub-wallets
- **Concurrency**: 3 per worker
- **Priority**: High
- **Retry Strategy**: 3 attempts
- **Job Timeout**: 10 minutes

### Job Priority System

```mermaid
graph TB
    HIGH[High Priority]
    NORMAL[Normal Priority]
    LOW[Low Priority]

    HIGH --> |Priority: 10| CAMPAIGN_START[Campaign Start]
    HIGH --> |Priority: 10| DISTRIBUTION[Wallet Distribution]

    NORMAL --> |Priority: 5| BUY[Buy Transaction]
    NORMAL --> |Priority: 5| SELL[Sell Transaction]

    LOW --> |Priority: 1| STATUS_AGG[Status Aggregation]
    LOW --> |Priority: 1| CLEANUP[Cleanup Jobs]
```

---

## Security Architecture

### Authentication & Authorization Flow

```mermaid
sequenceDiagram
    actor User
    participant API
    participant Supabase
    participant Guard
    participant Handler

    User->>API: Request with JWT
    API->>Guard: Extract JWT
    Guard->>Supabase: Verify JWT

    alt Valid JWT
        Supabase-->>Guard: User payload
        Guard->>Guard: Check user role

        alt Has required role
            Guard-->>Handler: Allow request
            Handler->>Handler: Process request
            Handler-->>User: Response
        else Insufficient permissions
            Guard-->>User: 403 Forbidden
        end
    else Invalid JWT
        Supabase-->>Guard: Invalid token
        Guard-->>User: 401 Unauthorized
    end
```

### Encryption Architecture

```mermaid
graph TB
    subgraph "Key Management"
        MASTER[Master Encryption Key]
        ENV[Environment Variable]
    end

    subgraph "Encryption Layer"
        SERVICE[Encryption Service]
        AES[AES-256-GCM]
        SALT[Random Salt/IV]
    end

    subgraph "Encrypted Data"
        WALLET_KEY[Wallet Private Keys]
        API_KEY[API Keys]
        SECRETS[Other Secrets]
    end

    subgraph "Storage"
        DB[(Database)]
    end

    ENV --> MASTER
    MASTER --> SERVICE
    SERVICE --> AES
    SERVICE --> SALT

    AES --> WALLET_KEY & API_KEY & SECRETS
    WALLET_KEY & API_KEY & SECRETS --> DB

    DB -.->|Decrypt| SERVICE
    SERVICE -.->|Plaintext| APP[Application]
```

**Encryption Details:**
- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2
- **Salt/IV**: Random, unique per encryption
- **Master Key**: 32+ bytes, base64-encoded
- **Storage**: Encrypted data stored in database

### Network Security

```mermaid
graph TB
    INTERNET[Internet]

    subgraph "DMZ"
        LB[Load Balancer]
        WAF[Web Application Firewall]
    end

    subgraph "Application Layer"
        API[API Service]
    end

    subgraph "Internal Network"
        WORKER[Worker Service]
        REDIS[(Redis)]
    end

    subgraph "External Services"
        DB[(Supabase)]
        RPC[RPC Provider]
    end

    INTERNET --> WAF
    WAF --> LB
    LB --> API

    API --> WORKER
    API --> REDIS
    WORKER --> REDIS

    API --> DB
    WORKER --> DB
    WORKER --> RPC

    style WAF fill:#f9f,stroke:#333
    style DB fill:#9cf,stroke:#333
    style RPC fill:#9cf,stroke:#333
```

---

## Deployment Architecture

### Docker Compose Deployment

```mermaid
graph TB
    subgraph "Docker Host"
        subgraph "API Container"
            API[NestJS API]
            API_PORT[Port 3001]
        end

        subgraph "Worker Containers"
            W1[Worker 1]
            W2[Worker 2]
            WN[Worker N]
        end

        subgraph "Redis Container"
            REDIS[Redis Server]
            REDIS_PORT[Port 6379]
        end

        NETWORK[Docker Bridge Network]
    end

    subgraph "External"
        SUPABASE[(Supabase Cloud)]
        RPC[RPC Provider]
    end

    API --> NETWORK
    W1 & W2 & WN --> NETWORK
    REDIS --> NETWORK

    NETWORK --> SUPABASE
    NETWORK --> RPC

    API_PORT -.-> INTERNET
    REDIS_PORT -.-> LOCALHOST
```

### Kubernetes Deployment

```mermaid
graph TB
    INGRESS[Ingress Controller]

    subgraph "Namespace: volume-bot"
        subgraph "API Deployment"
            API1[API Pod 1]
            API2[API Pod 2]
        end

        subgraph "Worker Deployment"
            W1[Worker Pod 1]
            W2[Worker Pod 2]
            WN[Worker Pod N]
        end

        subgraph "Redis StatefulSet"
            REDIS[Redis Pod]
            PVC[Persistent Volume]
        end

        SVC_API[API Service]
        SVC_REDIS[Redis Service]

        CM[ConfigMap]
        SECRET[Secrets]

        HPA[Horizontal Pod Autoscaler]
    end

    subgraph "External"
        SUPABASE[(Supabase)]
        RPC[RPC Provider]
    end

    INGRESS --> SVC_API
    SVC_API --> API1 & API2

    API1 & API2 --> SVC_REDIS
    W1 & W2 & WN --> SVC_REDIS
    SVC_REDIS --> REDIS
    REDIS --> PVC

    API1 & API2 & W1 & W2 & WN --> CM
    API1 & API2 & W1 & W2 & WN --> SECRET

    HPA -.->|Scale| W1 & W2 & WN

    API1 & API2 & W1 & W2 & WN -.-> SUPABASE
    W1 & W2 & WN -.-> RPC
```

### Multi-Region Deployment (Advanced)

```mermaid
graph TB
    subgraph "Global"
        DNS[DNS / Route53]
        CDN[CloudFront CDN]
    end

    subgraph "US-East Region"
        LB_EAST[Load Balancer]

        subgraph "K8s Cluster East"
            API_EAST[API Pods]
            WORKER_EAST[Worker Pods]
            REDIS_EAST[(Redis)]
        end
    end

    subgraph "EU-West Region"
        LB_WEST[Load Balancer]

        subgraph "K8s Cluster West"
            API_WEST[API Pods]
            WORKER_WEST[Worker Pods]
            REDIS_WEST[(Redis)]
        end
    end

    subgraph "Shared Services"
        SUPABASE[(Supabase - Primary)]
        SUPABASE_REPLICA[(Supabase - Read Replica)]
    end

    DNS --> CDN
    CDN --> LB_EAST
    CDN --> LB_WEST

    LB_EAST --> API_EAST
    LB_WEST --> API_WEST

    API_EAST --> REDIS_EAST
    API_WEST --> REDIS_WEST

    WORKER_EAST --> REDIS_EAST
    WORKER_WEST --> REDIS_WEST

    API_EAST & API_WEST --> SUPABASE
    API_EAST & API_WEST --> SUPABASE_REPLICA

    WORKER_EAST & WORKER_WEST --> SUPABASE
```

---

## Design Decisions

### Why BullMQ for Job Queues?

**Rationale:**
- Built on Redis (already in stack)
- Superior features over Bull:
  - Better TypeScript support
  - Improved retry mechanisms
  - Built-in rate limiting
  - Priority queues
  - Better performance
- Active maintenance
- Excellent documentation

**Alternatives Considered:**
- Agenda (MongoDB-based)
- Bee-Queue (simpler but less features)
- AWS SQS (vendor lock-in, additional cost)

### Why Supabase for Database?

**Rationale:**
- PostgreSQL (proven, reliable)
- Built-in authentication
- Real-time subscriptions
- Row Level Security (RLS)
- Generous free tier
- Easy scaling path
- Managed backups

**Alternatives Considered:**
- Self-hosted PostgreSQL (more operational overhead)
- PlanetScale (MySQL, different ecosystem)
- MongoDB (not ideal for relational data)

### Why NestJS for API?

**Rationale:**
- Enterprise-grade TypeScript framework
- Excellent dependency injection
- Built-in Swagger integration
- Strong community
- Opinionated structure (good for teams)
- Extensive middleware ecosystem

**Alternatives Considered:**
- Express.js (too minimal, less structure)
- Fastify (faster but smaller ecosystem)
- Hono (newer, less mature)

### Why OpenTelemetry?

**Rationale:**
- Vendor-neutral standard
- Single instrumentation for multiple backends
- Future-proof (industry standard)
- Comprehensive auto-instrumentation
- Active CNCF project

**Alternatives Considered:**
- Datadog APM (vendor lock-in)
- New Relic (expensive at scale)
- AWS X-Ray (AWS-specific)

---

## Scalability Considerations

### Horizontal Scaling

**API Service:**
- Stateless design
- Can scale to N replicas
- Load balanced via Ingress/ALB
- No shared state (uses Redis for sessions)

**Worker Service:**
- Horizontally scalable
- Each worker polls from shared queue
- Auto-scaling based on queue depth
- Recommended: 1 worker per 100 active campaigns

**Redis:**
- Single master for simplicity
- Can add read replicas for metrics
- Redis Cluster for extreme scale
- Consider managed Redis (ElastiCache, Redis Cloud)

### Vertical Scaling

**When to scale vertically:**
- API: High CPU during request processing
- Worker: High memory during transaction building
- Redis: High memory usage from queue depth

**Resource Recommendations:**

| Component | Min | Recommended | High Load |
|-----------|-----|-------------|-----------|
| API       | 512MB / 0.5 CPU | 1GB / 1 CPU | 2GB / 2 CPU |
| Worker    | 512MB / 0.5 CPU | 1GB / 1 CPU | 2GB / 2 CPU |
| Redis     | 512MB | 2GB | 8GB |

### Performance Optimization

**Database:**
- Connection pooling (PgBouncer)
- Appropriate indexes
- Query optimization
- Materialized views for stats

**Redis:**
- Connection pooling
- Pipeline commands
- Use appropriate data structures
- Set TTL on cached data

**RPC Providers:**
- Connection pooling
- Request batching where possible
- Fallback to multiple providers
- Monitor rate limits

---

## Disaster Recovery

### Backup Strategy

**Database (Supabase):**
- Automatic daily backups (Supabase managed)
- Point-in-time recovery available
- Test restore quarterly

**Redis:**
- RDB snapshots (if persistence enabled)
- AOF (Append-Only File) for durability
- Regular backups via `BGSAVE`

**Configuration:**
- Store in version control (Git)
- Secret management via Vault/Secrets Manager
- Document all environment variables

### Recovery Procedures

**Database Failure:**
1. Verify Supabase status
2. Check for scheduled maintenance
3. If outage, wait for Supabase recovery
4. If corruption, restore from backup
5. Validate data integrity post-restore

**Redis Failure:**
1. Check Redis logs
2. Restart Redis service
3. If data loss, jobs will be retried by workers
4. Monitor queue recovery
5. Consider replaying failed jobs

**Complete System Failure:**
1. Restore infrastructure (K8s/Docker)
2. Deploy latest version
3. Restore database from backup
4. Verify all services healthy
5. Resume campaigns gradually

---

## Additional Resources

- [Deployment Guide](./DEPLOYMENT.md)
- [Environment Setup Guide](./ENVIRONMENT_SETUP.md)
- [Monitoring and Runbook Guide](./MONITORING_AND_RUNBOOK.md)
- [API Documentation](http://localhost:3001/api-docs)

---

**Last Updated:** 2025-10-14
