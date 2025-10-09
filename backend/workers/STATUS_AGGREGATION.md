# Status Aggregation System

## Overview

The Status Aggregation System provides real-time campaign metrics and progress tracking by periodically aggregating job statistics and broadcasting updates to connected clients via WebSocket.

## Architecture

The system consists of three main components:

### 1. StatusAggregatorWorker (Workers Service)
- **Location**: `backend/workers/src/workers/StatusAggregatorWorker.ts`
- **Purpose**: Periodic scheduler that discovers active campaigns and dispatches aggregation jobs
- **Behavior**:
  - Runs every 10-30 seconds (configurable via `STATUS_AGGREGATOR_INTERVAL_SECONDS` env var, default: 15s)
  - Queries database for campaigns with `status='active'` and runs with `status='running'`
  - Creates database job entries for tracking
  - Dispatches jobs to the StatusWorker queue via BullMQ
  - Prevents duplicate scheduling with per-campaign tracking
  - Automatically cleans up stale entries when campaigns become inactive

### 2. StatusWorker (Workers Service)
- **Location**: `backend/workers/src/workers/StatusWorker.ts`
- **Purpose**: Processes status aggregation jobs and calculates comprehensive metrics
- **Features**:
  - Fetches campaign run data with all associated jobs and executions
  - Calculates comprehensive metrics:
    - Overall job counts (total, succeeded, failed, queued, running, cancelled)
    - Success rate
    - Queue-specific breakdown (jobs by queue with status counts)
    - Execution statistics (total executions, average latency)
  - Updates `campaign_runs.summary` JSONB field in database
  - Supports optional WebSocket broadcasting (configured at initialization)

### 3. StatusMonitorService (API Service)
- **Location**: `backend/api/src/services/status-monitor.service.ts`
- **Purpose**: Monitors database changes and broadcasts updates via WebSocket
- **Features**:
  - Uses Supabase real-time subscriptions to listen for `campaign_runs` table updates
  - Automatically broadcasts status updates when `summary` field changes
  - Handles connection errors with automatic reconnection
  - Provides manual broadcast API for on-demand updates

## Data Flow

```
1. StatusAggregatorWorker (every 15s)
   ↓
2. Query active campaigns
   ↓
3. Create DB job entry
   ↓
4. Dispatch to StatusWorker queue
   ↓
5. StatusWorker processes job
   ↓
6. Calculate metrics from jobs/executions
   ↓
7. Update campaign_runs.summary
   ↓
8. StatusMonitorService detects DB change (Supabase realtime)
   ↓
9. Broadcast via WebSocket to subscribed clients
```

## Metrics Structure

The `campaign_runs.summary` field contains a JSON object with the following structure:

```typescript
{
  totalJobs: number;              // Total number of jobs for this run
  succeededJobs: number;          // Jobs with status='succeeded'
  failedJobs: number;             // Jobs with status='failed'
  queuedJobs: number;             // Jobs with status='queued'
  runningJobs: number;            // Jobs with status='running'
  cancelledJobs: number;          // Jobs with status='cancelled'
  successRate: number;            // succeededJobs / totalJobs (0-1)

  byQueue: {                      // Queue-specific breakdown
    [queueName: string]: {
      total: number;              // Total jobs in this queue
      succeeded: number;          // Succeeded jobs in this queue
      failed: number;             // Failed jobs in this queue
      queued: number;             // Queued jobs in this queue
      running: number;            // Running jobs in this queue
    };
  };

  totalExecutions: number;        // Total transaction executions
  avgLatencyMs: number;           // Average execution latency in milliseconds
}
```

## WebSocket Events

### Event: `campaign:status`

Broadcasted to clients subscribed to a campaign room (`campaign:{campaignId}`).

**Payload:**
```typescript
{
  runId: string;                  // Campaign run ID
  campaignId: string;             // Campaign ID
  status: string;                 // Run status ('running', 'paused', 'stopped', etc.)
  metrics: JobMetrics;            // Full metrics object (see above)
  updatedAt: string;              // ISO timestamp of update
}
```

## Configuration

### Environment Variables

#### Workers Service
- `STATUS_AGGREGATOR_INTERVAL_SECONDS`: Interval between status checks (default: 15)
  - Recommended range: 10-30 seconds
  - Lower values = more frequent updates but higher load
  - Higher values = less frequent updates but lower load

#### API Service
- No specific configuration required
- Uses existing Supabase connection and WebSocket gateway

### Database Setup

The system uses the existing `campaign_runs` table with the `summary` JSONB column. No additional migrations required.

## Usage

### Starting the System

The Status Aggregation System starts automatically when the workers service is initialized:

```bash
# Start workers service
cd backend/workers
npm run dev
```

The StatusAggregatorWorker will start its periodic scheduler and begin monitoring for active campaigns.

### Frontend Integration

Clients can subscribe to campaign status updates via WebSocket:

```typescript
// Connect to WebSocket
const socket = io('http://localhost:3000/campaigns', {
  auth: { token: userAuthToken }
});

// Join campaign room
socket.emit('join_campaign', { campaignId: 'campaign-123' });

// Listen for status updates
socket.on('campaign:status', (data) => {
  console.log('Campaign status update:', data);
  // data.metrics contains full metrics object
  // Update UI with new metrics
});

// Leave campaign room
socket.emit('leave_campaign', { campaignId: 'campaign-123' });
```

### Manual Status Broadcast

The StatusMonitorService provides a method for manually triggering status broadcasts:

```typescript
// In any NestJS service
constructor(private readonly statusMonitor: StatusMonitorService) {}

async triggerStatusUpdate(campaignId: string) {
  await this.statusMonitor.broadcastCampaignStatus(campaignId);
}
```

## Monitoring and Debugging

### Logs

The system provides comprehensive logging for monitoring:

**StatusAggregatorWorker:**
- `[STATUS-AGGREGATOR] Starting periodic scheduler (interval: {ms}ms)`
- `[STATUS-AGGREGATOR] Checking for active campaigns...`
- `[STATUS-AGGREGATOR] Found {n} active campaign run(s)`
- `[STATUS-AGGREGATOR] Scheduled status aggregation for campaign {id} (run: {runId})`
- `[STATUS-AGGREGATOR] Scheduled {n} status job(s)`

**StatusWorker:**
- `[STATUS] Processing job {id}...`
- `[STATUS] Broadcasting status update for campaign {campaignId} (run: {runId})`
- `[STATUS] Error handling campaign run update: {error}`

**StatusMonitorService:**
- `[StatusMonitor] Initializing real-time subscription...`
- `[StatusMonitor] Successfully subscribed to campaign_runs updates`
- `[StatusMonitor] Broadcasting status update for campaign {campaignId} (run: {runId})`
- `[StatusMonitor] Channel error, attempting to reconnect...`

### Health Checks

To verify the system is functioning:

1. **Check worker logs** for periodic scheduling messages every 15s
2. **Monitor BullMQ dashboard** for status jobs being processed
3. **Query database** to verify `campaign_runs.summary` is being updated:
   ```sql
   SELECT id, campaign_id, summary
   FROM campaign_runs
   WHERE status = 'running'
   ORDER BY started_at DESC
   LIMIT 10;
   ```
4. **Test WebSocket connection** using the frontend or a WebSocket client

## Error Handling

The system is designed to be resilient:

### Database Errors
- Query failures are logged and don't crash the worker
- Invalid data is handled gracefully with empty metrics
- Update failures are logged but don't prevent job completion

### WebSocket Errors
- Broadcast failures are caught and logged
- Don't affect status worker completion
- StatusMonitorService auto-reconnects on channel errors

### Queue Errors
- Job scheduling failures are caught and logged
- Don't affect other campaigns being scheduled
- Dead-letter queue captures failed status jobs

## Performance Considerations

### Database Load
- Each aggregation job queries one campaign run with all jobs/executions
- With 10 active campaigns and 15s interval: ~40 queries/minute
- Consider adding database indexes on `campaign_runs.status` and `jobs.run_id`

### Memory Usage
- StatusAggregatorWorker maintains a small in-memory map of scheduled campaigns
- Automatically cleaned up when campaigns become inactive
- Typical memory footprint: <1MB for 100 active campaigns

### Network Traffic
- WebSocket broadcasts only sent when metrics change (via DB trigger)
- Typical payload size: 500 bytes - 2KB depending on metrics
- With 10 campaigns updating every 15s: ~10-40 KB/minute per connected client

## Testing

Comprehensive test suites are provided:

### StatusWorker Tests
- **Location**: `backend/workers/src/workers/__tests__/status-worker.spec.ts`
- **Coverage**: Metrics calculation, database updates, WebSocket broadcasting, error handling

### StatusAggregatorWorker Tests
- **Location**: `backend/workers/src/workers/__tests__/status-aggregator-worker.spec.ts`
- **Coverage**: Scheduling, duplicate prevention, cleanup, error handling

### Running Tests

```bash
cd backend/workers
npm test status-worker.spec.ts
npm test status-aggregator-worker.spec.ts
```

## Troubleshooting

### Status updates not appearing

1. **Check StatusAggregatorWorker is running:**
   ```bash
   # Look for log message
   [STATUS-AGGREGATOR] Starting periodic scheduler (interval: 15000ms)
   ```

2. **Verify campaigns are active:**
   ```sql
   SELECT c.id, c.status, cr.id as run_id, cr.status as run_status
   FROM campaigns c
   JOIN campaign_runs cr ON cr.campaign_id = c.id
   WHERE c.status = 'active' AND cr.status = 'running';
   ```

3. **Check status jobs are being created:**
   ```sql
   SELECT * FROM jobs
   WHERE queue = 'status'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

4. **Verify StatusMonitorService is subscribed:**
   ```bash
   # Look for log message
   [StatusMonitor] Successfully subscribed to campaign_runs updates
   ```

### WebSocket clients not receiving updates

1. **Verify client is authenticated and joined campaign room**
2. **Check WebSocket gateway logs for connection errors**
3. **Test manual broadcast:**
   ```typescript
   await statusMonitorService.broadcastCampaignStatus('campaign-id');
   ```
4. **Verify Supabase realtime is enabled for the `campaign_runs` table**

### High CPU/memory usage

1. **Check STATUS_AGGREGATOR_INTERVAL_SECONDS** - may be too low (increase to 20-30s)
2. **Monitor number of active campaigns** - may need to optimize queries for large datasets
3. **Check for job processing backlog** - StatusWorker may be overwhelmed

## Future Improvements

Potential enhancements for future iterations:

1. **Redis caching** for recent metrics to reduce database load
2. **Configurable aggregation frequency** per campaign (some need real-time, others don't)
3. **Metrics history** tracking for trend analysis
4. **Alerting** when success rate drops below threshold
5. **Detailed execution metrics** (min/max latency, p95, p99)
6. **Cost tracking** (Jito tips, transaction fees)
7. **Real-time job progress** streaming for active jobs
