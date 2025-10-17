# Admin API Endpoints Specification

## Overview

This document defines the admin API endpoints for system monitoring, management, and control. All admin endpoints require authentication and admin role authorization.

## Base Path

```
/v1/admin
```

## Authentication & Authorization

- **Authentication**: Required - Supabase JWT token via `Authorization: Bearer <token>`
- **Authorization**: Admin role required (`role === 'admin'`)
- **Rate Limiting**: Higher limits for admin users (500 requests/minute vs 100 for regular users)

---

## 1. System Metrics Endpoints

### GET /v1/admin/metrics/system

Get real-time system health and performance metrics.

**Authorization**: Admin only

**Response**:

```typescript
{
  timestamp: string;              // ISO 8601 timestamp
  system: {
    uptime: number;               // seconds
    cpu: {
      usage: number;              // percentage (0-100)
      cores: number;
    };
    memory: {
      used: number;               // bytes
      total: number;              // bytes
      percentage: number;         // 0-100
    };
    redis: {
      connected: boolean;
      memoryUsed: number;         // bytes
      memoryPeak: number;         // bytes
      connectedClients: number;
    };
    database: {
      connected: boolean;
      activeConnections: number;
      idleConnections: number;
      totalConnections: number;
    };
  };
  api: {
    totalRequests: number;        // last 24h
    errorRate: number;            // percentage
    avgResponseTime: number;      // milliseconds
    p95ResponseTime: number;      // milliseconds
    p99ResponseTime: number;      // milliseconds
  };
  workers: {
    active: number;               // currently processing jobs
    completed: number;            // last 24h
    failed: number;               // last 24h
    avgProcessingTime: number;    // milliseconds
  };
}
```

**Error Responses**:

- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - User is not admin
- `500 Internal Server Error` - System error

---

### GET /v1/admin/metrics/queues

Get detailed queue statistics for all BullMQ queues.

**Authorization**: Admin only

**Query Parameters**:

- `timeRange` (optional): `1h` | `6h` | `24h` | `7d` | `30d` (default: `24h`)

**Response**:

```typescript
{
  timestamp: string;
  queues: {
    [queueName: string]: {
      name: string;               // gather, trade.buy, trade.sell, etc.
      waiting: number;            // jobs waiting to be processed
      active: number;             // jobs currently being processed
      completed: number;          // completed in time range
      failed: number;             // failed in time range
      delayed: number;            // scheduled for future
      paused: boolean;
      metrics: {
        throughput: number;       // jobs/minute
        avgWaitTime: number;      // milliseconds
        avgProcessingTime: number;// milliseconds
        errorRate: number;        // percentage
      };
    };
  };
}
```

---

### GET /v1/admin/metrics/rpc

Get RPC provider health and performance metrics.

**Authorization**: Admin only

**Response**:

```typescript
{
  timestamp: string;
  providers: Array<{
    name: string;                 // e.g., "primary", "fallback"
    url: string;                  // RPC endpoint URL (sanitized)
    status: 'healthy' | 'degraded' | 'down';
    metrics: {
      totalRequests: number;      // last 24h
      successRate: number;        // percentage
      avgLatency: number;         // milliseconds
      p95Latency: number;         // milliseconds
      errorRate: number;          // percentage
      lastError?: string;
      lastErrorTime?: string;
    };
  }>;
}
```

---

## 2. Campaign Management Endpoints

### GET /v1/admin/campaigns

List all campaigns across all users with filtering and pagination.

**Authorization**: Admin only

**Query Parameters**:

- `status` (optional): `draft` | `active` | `paused` | `stopped` | `completed`
- `userId` (optional): Filter by specific user UUID
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `sortBy` (optional): `created_at` | `updated_at` | `name` (default: `created_at`)
- `sortOrder` (optional): `asc` | `desc` (default: `desc`)

**Response**:

```typescript
{
  data: Array<{
    id: string;
    user_id: string;
    name: string;
    token: {
      id: string;
      symbol: string;
      mint: string;
    };
    pool: {
      id: string;
      pool_address: string;
      dex: string;
    };
    status: string;
    params: Record<string, any>;
    created_at: string;
    updated_at: string;
    user: {
      id: string;
      email: string;
    };
    stats: {
      totalRuns: number;
      activeRuns: number;
      totalJobs: number;
      successRate: number;
    };
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

---

### GET /v1/admin/campaigns/:id

Get detailed campaign information including user and audit history.

**Authorization**: Admin only

**Response**:

```typescript
{
  id: string;
  user_id: string;
  name: string;
  token_id: string;
  pool_id: string;
  params: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
  token: {
    id: string;
    mint: string;
    symbol: string;
    decimals: number;
  };
  pool: {
    id: string;
    pool_address: string;
    dex: string;
  };
  runs: Array<{
    id: string;
    started_at: string;
    ended_at: string | null;
    status: string;
    summary: Record<string, any>;
  }>;
  stats: {
    totalRuns: number;
    totalJobs: number;
    totalExecutions: number;
    successRate: number;
    totalVolume: number;
  };
}
```

---

### POST /v1/admin/campaigns/:id/override

Manually override campaign status (emergency control).

**Authorization**: Admin only

**Request Body**:

```typescript
{
  action: 'force_pause' | 'force_stop' | 'force_resume' | 'reset';
  reason: string;                // Required - audit trail
  notifyUser?: boolean;          // Optional - send notification to user
}
```

**Response**:

```typescript
{
  success: boolean;
  campaign: {
    id: string;
    status: string;
    updated_at: string;
  };
  audit: {
    id: string;
    action: string;
    reason: string;
    timestamp: string;
  };
}
```

---

## 3. User Management Endpoints

### GET /v1/admin/users

List all users with statistics and filtering.

**Authorization**: Admin only

**Query Parameters**:

- `role` (optional): `user` | `admin`
- `status` (optional): `active` | `suspended` | `deleted`
- `search` (optional): Search by email or ID
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response**:

```typescript
{
  data: Array<{
    id: string;
    email: string;
    role: string;
    status: 'active' | 'suspended' | 'deleted';
    created_at: string;
    updated_at: string;
    last_sign_in_at: string | null;
    stats: {
      totalCampaigns: number;
      activeCampaigns: number;
      totalWallets: number;
      totalVolume24h: number;
      totalTransactions24h: number;
    };
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

---

### GET /v1/admin/users/:id

Get detailed user information including activity and resource usage.

**Authorization**: Admin only

**Response**:

```typescript
{
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }>;
  wallets: Array<{
    id: string;
    address: string;
    label: string;
    is_active: boolean;
  }>;
  stats: {
    totalCampaigns: number;
    totalWallets: number;
    totalRuns: number;
    totalJobs: number;
    totalTransactions: number;
    totalVolume: number;
    successRate: number;
  };
  activity: Array<{
    id: string;
    action: string;
    entity: string;
    timestamp: string;
    metadata: Record<string, any>;
  }>;
}
```

---

### PATCH /v1/admin/users/:id

Update user status or role (admin operations).

**Authorization**: Admin only

**Request Body**:

```typescript
{
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
  reason: string;                // Required for audit
}
```

**Response**:

```typescript
{
  success: boolean;
  user: {
    id: string;
    email: string;
    role: string;
    status: string;
    updated_at: string;
  };
  audit: {
    id: string;
    action: string;
    reason: string;
    timestamp: string;
  };
}
```

---

## 4. Queue Management Endpoints

### GET /v1/admin/queues/:queueName/jobs

List jobs in a specific queue with filtering.

**Authorization**: Admin only

**Path Parameters**:

- `queueName`: `gather` | `trade.buy` | `trade.sell` | `distribute` | `funds.gather`

**Query Parameters**:

- `status` (optional): `waiting` | `active` | `completed` | `failed` | `delayed` | `paused`
- `limit` (optional): Max items (default: 50, max: 200)
- `start` (optional): Offset (default: 0)

**Response**:

```typescript
{
  queue: string;
  jobs: Array<{
    id: string;
    name: string;
    data: Record<string, any>;
    progress: number;             // 0-100
    attempts: number;
    timestamp: number;            // Unix timestamp
    processedOn?: number;
    finishedOn?: number;
    failedReason?: string;
    stacktrace?: string[];
    returnvalue?: any;
  }>;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}
```

---

### POST /v1/admin/queues/:queueName/pause

Pause all job processing for a queue.

**Authorization**: Admin only

**Request Body**:

```typescript
{
  reason: string;                // Required for audit
}
```

**Response**:

```typescript
{
  success: boolean;
  queue: string;
  paused: boolean;
  timestamp: string;
}
```

---

### POST /v1/admin/queues/:queueName/resume

Resume job processing for a paused queue.

**Authorization**: Admin only

**Response**:

```typescript
{
  success: boolean;
  queue: string;
  paused: boolean;
  timestamp: string;
}
```

---

### DELETE /v1/admin/queues/:queueName/jobs/:jobId

Remove a specific job from the queue (cancel/delete).

**Authorization**: Admin only

**Request Body**:

```typescript
{
  reason: string;                // Required for audit
}
```

**Response**:

```typescript
{
  success: boolean;
  jobId: string;
  queue: string;
  timestamp: string;
}
```

---

### POST /v1/admin/queues/:queueName/clean

Clean completed/failed jobs from a queue.

**Authorization**: Admin only

**Request Body**:

```typescript
{
  status: 'completed' | 'failed';
  age: number;                   // milliseconds (e.g., 86400000 for 24h)
  limit?: number;                // max jobs to clean (default: 1000)
}
```

**Response**:

```typescript
{
  success: boolean;
  queue: string;
  cleaned: number;               // number of jobs removed
  timestamp: string;
}
```

---

## 5. System Control Endpoints

### POST /v1/admin/system/pause

Emergency pause of all campaign execution (affects all queues).

**Authorization**: Admin only

**Request Body**:

```typescript
{
  reason: string;                // Required for audit and user notification
  notifyUsers?: boolean;         // Optional - send notification to all users
}
```

**Response**:

```typescript
{
  success: boolean;
  paused: boolean;
  timestamp: string;
  queues: Array<{
    name: string;
    paused: boolean;
  }>;
}
```

---

### POST /v1/admin/system/resume

Resume all system operations after emergency pause.

**Authorization**: Admin only

**Response**:

```typescript
{
  success: boolean;
  paused: boolean;
  timestamp: string;
  queues: Array<{
    name: string;
    paused: boolean;
  }>;
}
```

---

### GET /v1/admin/system/health

Comprehensive health check of all system components.

**Authorization**: Admin only

**Response**:

```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  components: {
    api: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      uptime: number;
      details?: string;
    };
    database: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      connectionPool: {
        active: number;
        idle: number;
        total: number;
      };
      details?: string;
    };
    redis: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      connected: boolean;
      memory: {
        used: number;
        peak: number;
      };
      details?: string;
    };
    queues: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      details: Array<{
        name: string;
        status: 'healthy' | 'degraded' | 'unhealthy';
        backlog: number;
        paused: boolean;
      }>;
    };
    rpc: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      providers: Array<{
        name: string;
        status: 'healthy' | 'degraded' | 'unhealthy';
        latency: number;
      }>;
    };
    workers: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      active: number;
      details?: string;
    };
  };
}
```

---

## 6. Audit & Logs Endpoints

### GET /v1/admin/audit-logs

Get system audit logs with filtering.

**Authorization**: Admin only

**Query Parameters**:

- `userId` (optional): Filter by user ID
- `action` (optional): Filter by action type
- `entity` (optional): Filter by entity type (campaign, wallet, user, etc.)
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 200)

**Response**:

```typescript
{
  data: Array<{
    id: string;
    user_id: string | null;
    admin_id: string | null;      // Admin who performed action
    action: string;
    entity: string;
    entity_id: string | null;
    metadata: Record<string, any>;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

---

### GET /v1/admin/logs/errors

Get recent error logs across the system.

**Authorization**: Admin only

**Query Parameters**:

- `level` (optional): `error` | `warning` (default: both)
- `source` (optional): `api` | `worker` | `database` | `rpc`
- `limit` (optional): Max items (default: 100, max: 500)
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response**:

```typescript
{
  errors: Array<{
    id: string;
    level: 'error' | 'warning';
    source: string;
    message: string;
    stack?: string;
    context: Record<string, any>;
    timestamp: string;
    count: number;                // If grouped
  }>;
  total: number;
}
```

---

## Error Handling

All admin endpoints follow standard error response format:

```typescript
{
  statusCode: number;
  message: string;
  error: string;
  details?: any;                  // Additional context for debugging
  timestamp: string;
}
```

### Standard HTTP Status Codes:

- `200 OK` - Success
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - User is not admin
- `404 Not Found` - Resource not found
- `409 Conflict` - Operation conflict (e.g., already paused)
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - System maintenance or overload

---

## Rate Limiting

Admin endpoints have higher rate limits:

- **Standard**: 500 requests per minute per admin user
- **Heavy operations** (pause/resume/clean): 20 requests per minute
- **Headers**:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Security Considerations

1. **Authentication**: All endpoints require valid Supabase JWT token
2. **Authorization**: Admin role verified via database lookup
3. **Audit Trail**: All admin actions logged to `audit_logs` table
4. **IP Logging**: Request IP and user agent logged for security
5. **Sensitive Data**: PII and private keys never included in responses
6. **CORS**: Restricted to admin dashboard origin only
7. **TLS**: All communication over HTTPS in production

---

## Implementation Notes

### Admin Role Verification

Create a custom guard that extends SupabaseAuthGuard:

```typescript
@Injectable()
export class AdminGuard extends SupabaseAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First check authentication
    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;

    // Then check admin role
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Query database for user role
    const profile = await this.supabase.getUserProfile(user.id);
    if (profile.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
```

### Audit Logging

All admin actions should be logged:

```typescript
async logAdminAction(
  adminId: string,
  action: string,
  entity: string,
  entityId: string,
  metadata: any,
  request: Request
) {
  await this.supabase.createAuditLog({
    admin_id: adminId,
    action,
    entity,
    entity_id: entityId,
    metadata,
    ip_address: request.ip,
    user_agent: request.headers['user-agent']
  });
}
```

---

## Future Enhancements (Post-MVP)

1. **Real-time Dashboard**: WebSocket feed for live system metrics
2. **Alerting**: Configurable alerts for system health issues
3. **Bulk Operations**: Batch user/campaign management
4. **Advanced Analytics**: Custom queries and reporting
5. **Feature Flags**: Toggle features on/off per user or globally
6. **Cost Analysis**: Track resource usage and costs per user
7. **Scheduled Maintenance**: Plan and announce maintenance windows
