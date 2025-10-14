# Contributing Guide

Thank you for your interest in contributing to the Solana Volume Bot! This guide will help you get started with development, testing, and contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing](#testing)
- [Git Workflow](#git-workflow)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)
- [Common Development Tasks](#common-development-tasks)

---

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **Git**: For version control
- **Docker & Docker Compose**: For local development (optional but recommended)
- **Redis**: Required for job queues
- **PostgreSQL**: Or use Supabase (recommended)

### Fork and Clone

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/boggy-volume-bot.git
   cd boggy-volume-bot
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/boggy-volume-bot.git
   ```

---

## Development Setup

### 1. Install Dependencies

```bash
# Install API dependencies
cd backend/api
npm install

# Install Worker dependencies
cd ../workers
npm install

# Install Frontend dependencies (if applicable)
cd ../../frontend
npm install
```

### 2. Environment Configuration

Create `.env` files for local development:

**backend/api/.env:**
```bash
NODE_ENV=development
API_PORT=3001

# Supabase (local or cloud)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Redis
REDIS_URL=redis://localhost:6379

# Encryption (generate with: npm run generate-master-key)
MASTER_ENCRYPTION_KEY=your-base64-encoded-key

# Solana RPC
SOLANA_RPC_URL=https://api.devnet.solana.com
RPC_WEBSOCKET_ENDPOINT=wss://api.devnet.solana.com

# Logging
LOG_LEVEL=debug

# Optional: Observability
SENTRY_DSN=
OTEL_ENABLED=false
```

**backend/workers/.env:**
```bash
# Copy same settings as API
NODE_ENV=development
# ... (same as API)
```

### 3. Start Local Services

#### Option A: Docker Compose (Recommended)

```bash
# Start Redis and optional PostgreSQL
docker-compose up -d redis

# Or start all services
docker-compose up -d
```

#### Option B: Manual Setup

```bash
# Start Redis
redis-server

# Start PostgreSQL (if not using Supabase)
# Follow PostgreSQL installation instructions for your OS
```

### 4. Run Database Migrations

```bash
cd backend/api
npm run migrate:up
```

### 5. Start Development Servers

```bash
# Terminal 1: Start API
cd backend/api
npm run dev

# Terminal 2: Start Worker
cd backend/workers
npm run dev

# Terminal 3: Start Frontend (optional)
cd frontend
npm run dev
```

### 6. Verify Setup

```bash
# Check API health
curl http://localhost:3001/v1/health

# View API documentation
open http://localhost:3001/api-docs
```

---

## Code Style Guidelines

### TypeScript

We use TypeScript for type safety and better developer experience.

**Key principles:**
- Use explicit types, avoid `any`
- Use interfaces for object shapes
- Use enums for constants
- Use generics where appropriate

**Example:**
```typescript
// ✅ Good
interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
}

enum CampaignStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

function getCampaign(id: string): Promise<Campaign> {
  // ...
}

// ❌ Bad
function getCampaign(id: any): Promise<any> {
  // ...
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Files** | kebab-case | `campaign.service.ts` |
| **Classes** | PascalCase | `CampaignService` |
| **Interfaces** | PascalCase (no I prefix) | `Campaign`, `CreateCampaignDto` |
| **Functions/Methods** | camelCase | `createCampaign()`, `validateInput()` |
| **Constants** | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| **Enums** | PascalCase (keys UPPER) | `CampaignStatus.ACTIVE` |
| **Type aliases** | PascalCase | `type UserId = string` |

### NestJS Conventions

Follow NestJS best practices:

**Module Structure:**
```
campaigns/
├── campaigns.module.ts
├── campaigns.controller.ts
├── campaigns.service.ts
├── dto/
│   ├── create-campaign.dto.ts
│   └── update-campaign.dto.ts
├── entities/
│   └── campaign.entity.ts
└── __tests__/
    ├── campaigns.controller.spec.ts
    └── campaigns.service.spec.ts
```

**Dependency Injection:**
```typescript
@Injectable()
export class CampaignService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly queue: QueueService,
  ) {}

  async createCampaign(dto: CreateCampaignDto): Promise<Campaign> {
    // Implementation
  }
}
```

**DTOs with Validation:**
```typescript
import { IsString, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty({ description: 'Campaign name' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ['buy', 'sell', 'both'] })
  @IsEnum(['buy', 'sell', 'both'])
  mode: string;

  @ApiProperty({ minimum: 0.01, maximum: 100 })
  @IsNumber()
  @Min(0.01)
  @Max(100)
  amount: number;
}
```

### Code Formatting

We use **Prettier** for automatic code formatting.

**Run formatter:**
```bash
# Format all files
npm run format

# Check formatting without fixing
npm run format:check
```

**Prettier configuration** (`.prettierrc`):
```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

### Linting

We use **ESLint** to catch common errors and enforce style.

**Run linter:**
```bash
# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

### Comments and Documentation

**When to comment:**
- Complex algorithms or business logic
- Non-obvious code behavior
- API endpoints (using JSDoc/Swagger decorators)
- Public functions and classes

**Example:**
```typescript
/**
 * Executes a buy transaction for a campaign
 *
 * @param campaignId - Unique campaign identifier
 * @param amount - Amount in SOL to purchase
 * @returns Transaction signature
 * @throws {InsufficientBalanceError} If wallet balance is too low
 */
async executeBuy(campaignId: string, amount: number): Promise<string> {
  // Calculate slippage tolerance based on market conditions
  const slippage = this.calculateSlippage(amount);

  // Submit transaction with retry logic
  return await this.submitTransaction({ amount, slippage });
}
```

### Error Handling

**Use custom exceptions:**
```typescript
// Custom exception
export class InsufficientBalanceError extends HttpException {
  constructor(required: number, available: number) {
    super(
      {
        statusCode: 400,
        message: `Insufficient balance: required ${required} SOL, available ${available} SOL`,
        error: 'InsufficientBalance',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

// Usage
if (balance < required) {
  throw new InsufficientBalanceError(required, balance);
}
```

**Async error handling:**
```typescript
// ✅ Good
async function processTransaction() {
  try {
    const result = await sendTransaction();
    return result;
  } catch (error) {
    logger.error({ error }, 'Transaction failed');
    throw new TransactionError('Failed to process transaction', error);
  }
}

// ❌ Bad (swallowing errors)
async function processTransaction() {
  try {
    return await sendTransaction();
  } catch (error) {
    console.log(error); // Don't just log and ignore
    return null;
  }
}
```

### Logging

Use structured logging with Pino:

```typescript
import { createLogger } from './config/logger';

const logger = createLogger({ name: 'campaign-service' });

// ✅ Good: Structured logging
logger.info({ campaignId: '123', action: 'start' }, 'Campaign started');
logger.error({ error, campaignId: '123' }, 'Campaign failed');

// ❌ Bad: Unstructured logging
console.log('Campaign 123 started');
console.error('Error:', error);
```

**Log levels:**
- `debug`: Detailed information for debugging
- `info`: General informational messages
- `warn`: Warning messages (non-critical)
- `error`: Error messages (failures)

---

## Testing

We use **Vitest** for unit and integration testing.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- src/services/campaign.service.spec.ts
```

### Test Structure

**Unit tests** (`.spec.ts`):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CampaignService } from './campaign.service';

describe('CampaignService', () => {
  let service: CampaignService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    service = new CampaignService(mockSupabase);
  });

  describe('createCampaign', () => {
    it('should create a campaign successfully', async () => {
      const dto = { name: 'Test Campaign', mode: 'buy' };
      const result = await service.createCampaign(dto);

      expect(result).toBeDefined();
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining(dto)
      );
    });

    it('should throw error if campaign name is duplicate', async () => {
      mockSupabase.insert.mockResolvedValue({
        error: { code: '23505' } // Unique violation
      });

      await expect(
        service.createCampaign({ name: 'Duplicate' })
      ).rejects.toThrow('Campaign already exists');
    });
  });
});
```

**Integration tests** (`*.integration.spec.ts`):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

describe('Campaigns API (Integration)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Get auth token
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password' });

    authToken = response.body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/v1/campaigns (POST)', async () => {
    return request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test Campaign',
        mode: 'buy',
        amount: 1.0,
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe('Test Campaign');
      });
  });
});
```

**E2E tests** (`*.e2e.spec.ts`):
```typescript
import { describe, it, expect } from 'vitest';

describe('Campaign Lifecycle (E2E)', () => {
  it('should complete full campaign lifecycle', async () => {
    // 1. Create campaign
    const campaign = await createCampaign();

    // 2. Start campaign
    await startCampaign(campaign.id);

    // 3. Wait for execution
    await waitForCompletion(campaign.id);

    // 4. Verify results
    const stats = await getCampaignStats(campaign.id);
    expect(stats.transactionCount).toBeGreaterThan(0);
  });
});
```

### Test Coverage

Aim for the following coverage:

| Type | Target |
|------|--------|
| **Unit tests** | 80%+ |
| **Integration tests** | Critical paths |
| **E2E tests** | Happy paths |

**View coverage report:**
```bash
npm run test:coverage
open coverage/index.html
```

### Mocking

**Mock external services:**
```typescript
// Mock Supabase
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockResolvedValue({ data: [], error: null }),
};

// Mock Redis
const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
};

// Mock Solana connection
const mockConnection = {
  getBalance: vi.fn().mockResolvedValue(1000000000), // 1 SOL
  sendTransaction: vi.fn().mockResolvedValue('signature'),
};
```

---

## Git Workflow

### Branching Strategy

We follow **Git Flow**:

- `main`: Production-ready code
- `develop`: Development branch (integration)
- `feature/*`: New features
- `bugfix/*`: Bug fixes
- `hotfix/*`: Critical production fixes
- `release/*`: Release preparation

**Example:**
```bash
# Create feature branch from develop
git checkout develop
git pull upstream develop
git checkout -b feature/add-campaign-analytics

# Work on feature...
git add .
git commit -m "feat: add campaign analytics endpoint"

# Push to your fork
git push origin feature/add-campaign-analytics
```

### Commit Messages

Follow **Conventional Commits** specification:

**Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(campaigns): add support for custom trading intervals

fix(wallets): resolve balance calculation error for wrapped SOL

docs(api): update Swagger documentation for campaign endpoints

refactor(workers): extract transaction logic into separate service

test(campaigns): add integration tests for campaign lifecycle
```

### Keeping Your Fork Updated

```bash
# Fetch upstream changes
git fetch upstream

# Merge upstream changes into your local branch
git checkout develop
git merge upstream/develop

# Push to your fork
git push origin develop
```

---

## Pull Request Process

### 1. Before Submitting

- [ ] Code follows style guidelines
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Coverage meets requirements
- [ ] Documentation is updated
- [ ] Commit messages follow conventions
- [ ] Branch is up-to-date with `develop`

### 2. Create Pull Request

1. **Push your branch** to your fork
2. **Open a pull request** against `develop` branch
3. **Fill out the PR template**:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests pass locally

## Related Issues
Closes #123
```

### 3. Code Review

- Address reviewer feedback promptly
- Make requested changes in new commits
- Respond to comments
- Be open to suggestions

### 4. Merging

Once approved:
- Maintainer will merge your PR
- Delete your feature branch
- Pull latest changes from upstream

---

## Project Structure

```
boggy-volume-bot/
├── backend/
│   ├── api/                    # NestJS API service
│   │   ├── src/
│   │   │   ├── v1/            # API versioned routes
│   │   │   ├── services/      # Business logic
│   │   │   ├── guards/        # Auth guards
│   │   │   ├── config/        # Configuration
│   │   │   ├── tracing/       # OpenTelemetry
│   │   │   └── main.ts        # Entry point
│   │   ├── package.json
│   │   └── vitest.config.ts
│   │
│   └── workers/               # Background job workers
│       ├── src/
│       │   ├── processors/    # Job processors
│       │   └── services/      # Worker services
│       └── package.json
│
├── frontend/                  # React frontend (if applicable)
│   ├── src/
│   └── package.json
│
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── ENVIRONMENT_SETUP.md
│   ├── MONITORING_AND_RUNBOOK.md
│   └── CONTRIBUTING.md
│
├── scripts/                   # Utility scripts
├── k8s/                      # Kubernetes manifests
├── docker-compose.yml        # Local development
├── docker-compose.prod.yml   # Production deployment
└── README.md
```

---

## Common Development Tasks

### Generate Master Encryption Key

```bash
cd backend/api
npm run generate-master-key
```

### Run Database Migrations

```bash
# Create new migration
npm run migrate:create add_campaign_tags

# Run pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Check migration status
npm run migrate:status
```

### Add New API Endpoint

1. **Create DTO:**
   ```bash
   touch src/v1/campaigns/dto/create-campaign-tag.dto.ts
   ```

2. **Update controller:**
   ```typescript
   @Post(':id/tags')
   @ApiOperation({ summary: 'Add tag to campaign' })
   async addTag(
     @Param('id') id: string,
     @Body() dto: CreateCampaignTagDto,
   ) {
     return this.campaignsService.addTag(id, dto);
   }
   ```

3. **Update service:**
   ```typescript
   async addTag(campaignId: string, dto: CreateCampaignTagDto) {
     // Implementation
   }
   ```

4. **Write tests:**
   ```typescript
   it('should add tag to campaign', async () => {
     // Test implementation
   });
   ```

5. **Update Swagger documentation**

### Add New Queue/Job

1. **Define job data interface:**
   ```typescript
   interface CampaignAnalyticsJobData {
     campaignId: string;
     startDate: Date;
     endDate: Date;
   }
   ```

2. **Create queue:**
   ```typescript
   const analyticsQueue = new Queue<CampaignAnalyticsJobData>('campaign-analytics', {
     connection: redisConfig,
   });
   ```

3. **Create processor:**
   ```typescript
   const analyticsWorker = new Worker<CampaignAnalyticsJobData>(
     'campaign-analytics',
     async (job) => {
       const { campaignId, startDate, endDate } = job.data;
       // Process job
     },
     { connection: redisConfig }
   );
   ```

4. **Add tests**

### Debug Worker Issues

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Check Redis queue
redis-cli
> LLEN bull:campaign-executor:wait
> LRANGE bull:campaign-executor:wait 0 -1

# View BullMQ dashboard
# Access at http://localhost:3001/admin/queues
```

### Update Dependencies

```bash
# Check outdated packages
npm outdated

# Update all dependencies
npm update

# Update specific package
npm install package-name@latest

# Run tests after update
npm test
```

---

## Need Help?

- **Documentation**: Check the [docs/](../docs/) folder
- **Issues**: Search [GitHub Issues](https://github.com/OWNER/REPO/issues)
- **Discussions**: Start a [GitHub Discussion](https://github.com/OWNER/REPO/discussions)
- **Chat**: Join our [Discord/Slack] (if applicable)

---

## Code of Conduct

Please be respectful and constructive in all interactions. We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/).

---

## License

By contributing, you agree that your contributions will be licensed under the project's license.

---

**Thank you for contributing to the Solana Volume Bot!** 🚀
