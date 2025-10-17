# Connection Pooling Configuration

This document describes the connection pooling strategy for Redis and Postgres in the Volume Bot backend.

## Redis Connection Pooling

### Overview

The application uses a centralized Redis connection pool managed by `backend/api/src/config/redis.config.ts`. This ensures efficient resource usage and prevents connection exhaustion.

### Configuration

**Location**: `backend/api/src/config/redis.config.ts`

**Pool Settings**:
- `maxRetriesPerRequest`: 3 retries per command
- `enableAutoPipelining`: true (automatic command batching)
- `enableReadyCheck`: true (verify connection before use)
- `connectTimeout`: 10000ms (10 seconds)
- `keepAlive`: 30000ms (30 seconds keep-alive interval)
- `retryStrategy`: Exponential backoff with max 3 seconds

### Usage

#### Shared Connection (Recommended for most use cases)

```typescript
import { getRedisClient } from '../config/redis.config'

// Get the shared Redis client
const redis = getRedisClient()

// Use for caching, throttling, etc.
await redis.set('key', 'value')
```

**Used by**:
- `RedisCacheService` - Pool/token caching
- `RedisThrottlerStorage` - Rate limiting
- `RedisHealthIndicator` - Health checks

#### Dedicated Connection (For BullMQ and isolated workloads)

```typescript
import { createRedisClient } from '../config/redis.config'

// Create a dedicated connection for BullMQ
const redis = createRedisClient({
    maxRetriesPerRequest: null, // BullMQ handles retries
    enableReadyCheck: false,
})

const queue = new Queue('myQueue', { connection: redis })
```

**Used by**:
- `CampaignsController` - BullMQ queue connections
- Worker processes - Job processing

### Monitoring

```typescript
import { getRedisPoolStats } from '../config/redis.config'

const stats = await getRedisPoolStats()
console.log(stats)
// {
//   connected: true,
//   status: 'ready',
//   commandQueueLength: 0,
//   offlineQueueLength: 0
// }
```

### Connection Lifecycle

1. **Initialization**: First call to `getRedisClient()` creates the singleton
2. **Reuse**: Subsequent calls return the same instance
3. **Shutdown**: `closeRedisClient()` is called on application shutdown via `AppModule.onApplicationShutdown()`

### Benefits

- **Resource Efficiency**: Single connection shared across services
- **Automatic Reconnection**: Built-in retry strategy handles connection failures
- **Command Pipelining**: Automatically batches commands for better performance
- **Graceful Shutdown**: Proper cleanup on application termination

## Postgres Connection Pooling

### Overview

Postgres connection pooling is handled by **Supabase** via PostgREST. The `@supabase/supabase-js` client automatically manages connections through Supabase's connection pooler.

### Configuration

**Supabase Connection Pooler** (Built-in):
- **Transaction Mode**: Best for short-lived connections
- **Session Mode**: For persistent connections (optional)
- **Default Pool Size**: 15 connections per database
- **Max Connections**: Configurable in Supabase dashboard

### Usage

```typescript
import { SupabaseService } from './services/supabase.service'

// Inject the service
constructor(private readonly supabase: SupabaseService) {}

// All database operations automatically use the connection pool
const data = await this.supabase.getTokenById(id)
```

### How It Works

1. **Supabase SDK** creates a client with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. **PostgREST** (Supabase's REST API layer) handles connection pooling
3. **PgBouncer** (Supabase's connection pooler) manages Postgres connections
4. Connections are pooled and reused automatically

### Optimization Strategies

#### 1. Database Indexes
We've added comprehensive indexes in `backend/api/migrations/002_add_performance_indexes.sql`:
- Composite indexes for common query patterns
- GIN indexes for JSONB columns
- Partial indexes for filtered queries

#### 2. Query Optimization
- Use `select('*')` only when needed
- Limit result sets with `.limit()`
- Use `.single()` for single-row queries
- Leverage indexes with proper `WHERE` clauses

#### 3. Caching Layer
Redis caching (via `RedisCacheService`) reduces database load:
- Tokens cached for 1 hour
- Pools cached for 10 minutes
- Cache invalidation on writes

### Monitoring

**Supabase Dashboard**:
1. Navigate to Settings > Database
2. View "Connection Pooling" section
3. Monitor active connections and pool usage

**Application Metrics**:
```typescript
// Use SupabaseService with try/catch for error tracking
try {
    const data = await this.supabase.getTokenById(id)
} catch (error) {
    // Log connection errors
    console.error('Database error:', error)
}
```

### Connection Limits

**Default Limits**:
- Free tier: 60 direct connections
- Pro tier: 200+ direct connections
- Connection pooler: 15 connections per database

**If you hit limits**:
1. Increase pool size in Supabase dashboard
2. Switch to session pooling mode if needed
3. Implement application-level connection pooling (pg-pool)
4. Scale up Supabase plan

## Best Practices

### Redis
1. ✅ Use `getRedisClient()` for shared operations
2. ✅ Use `createRedisClient()` for isolated workloads (BullMQ)
3. ✅ Don't close shared connection in individual services
4. ✅ Monitor command queue length
5. ✅ Use pipelining for bulk operations

### Postgres
1. ✅ Leverage Supabase's built-in pooling
2. ✅ Add database indexes for frequent queries
3. ✅ Use caching for frequently accessed data
4. ✅ Paginate large result sets
5. ✅ Monitor connection usage in Supabase dashboard

## Troubleshooting

### Redis Connection Issues

**Error**: "Connection timeout"
```bash
# Check Redis is running
redis-cli ping

# Check connection settings
echo $REDIS_URL
```

**Error**: "Too many connections"
```typescript
// Check pool stats
const stats = await getRedisPoolStats()
console.log(stats.commandQueueLength) // Should be low
```

### Postgres Connection Issues

**Error**: "remaining connection slots are reserved"
```bash
# Check Supabase dashboard for connection usage
# Increase connection pool size if needed
```

**Error**: "Connection pool exhausted"
```typescript
// Add connection pooling monitoring
// Check for leaked connections (missing await/try-catch)
```

## Performance Tuning

### Redis
- Adjust `keepAlive` interval based on connection stability
- Tune `retryStrategy` for your network conditions
- Enable `enableAutoPipelining` for bulk operations

### Postgres
- Add more indexes for slow queries
- Implement read replicas for read-heavy workloads
- Use Supabase's Realtime for subscription-based data
- Consider materialized views for complex aggregations

## Environment Variables

```bash
# Redis
REDIS_URL=redis://localhost:6379

# Supabase (Postgres)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Related Files

- `backend/api/src/config/redis.config.ts` - Redis connection pool
- `backend/api/src/services/redis-cache.service.ts` - Redis caching
- `backend/api/src/services/supabase.service.ts` - Postgres client
- `backend/api/src/app.module.ts` - Application shutdown hooks
- `backend/api/migrations/002_add_performance_indexes.sql` - Database indexes
