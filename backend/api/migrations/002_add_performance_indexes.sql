-- Performance Optimization: Additional Indexes for Critical Queries
-- Migration 002: Add missing database indexes based on query patterns

-- ==============================================================================
-- Campaign Performance Indexes
-- ==============================================================================

-- Composite index for getCampaignsByUserId with ordering
CREATE INDEX IF NOT EXISTS idx_campaigns_user_created
ON campaigns(user_id, created_at DESC);

-- Composite index for getAdminCampaigns filtering and sorting
CREATE INDEX IF NOT EXISTS idx_campaigns_status_created
ON campaigns(status, created_at DESC);

-- ==============================================================================
-- Campaign Runs Performance Indexes
-- ==============================================================================

-- Composite index for getCampaignRunsByCampaignId with ordering
CREATE INDEX IF NOT EXISTS idx_campaign_runs_campaign_started
ON campaign_runs(campaign_id, started_at DESC);

-- Index for campaign run status filtering
CREATE INDEX IF NOT EXISTS idx_campaign_runs_status
ON campaign_runs(status);

-- ==============================================================================
-- Jobs Performance Indexes
-- ==============================================================================

-- Composite index for jobs by run_id with ordering
CREATE INDEX IF NOT EXISTS idx_jobs_run_created
ON jobs(run_id, created_at DESC);

-- Composite index for job status with run_id
CREATE INDEX IF NOT EXISTS idx_jobs_run_status
ON jobs(run_id, status);

-- Index for queue operations
CREATE INDEX IF NOT EXISTS idx_jobs_queue
ON jobs(queue);

-- Index for job type filtering
CREATE INDEX IF NOT EXISTS idx_jobs_type
ON jobs(type);

-- ==============================================================================
-- Executions Performance Indexes
-- ==============================================================================

-- Composite index for getRecentExecutions with timestamp filtering
CREATE INDEX IF NOT EXISTS idx_executions_job_created
ON executions(job_id, created_at DESC);

-- Index for execution timestamp range queries
CREATE INDEX IF NOT EXISTS idx_executions_created_at
ON executions(created_at DESC);

-- ==============================================================================
-- Wallets Performance Indexes
-- ==============================================================================

-- Composite index for getWalletsByUserId with ordering
CREATE INDEX IF NOT EXISTS idx_wallets_user_created
ON wallets(user_id, created_at DESC);

-- Index for active wallet queries
CREATE INDEX IF NOT EXISTS idx_wallets_user_active
ON wallets(user_id, is_active)
WHERE is_active = true;

-- ==============================================================================
-- Pools Performance Indexes
-- ==============================================================================

-- Index for pool address lookups
CREATE INDEX IF NOT EXISTS idx_pools_pool_address
ON pools(pool_address);

-- Index for DEX filtering
CREATE INDEX IF NOT EXISTS idx_pools_dex
ON pools(dex);

-- ==============================================================================
-- Audit Logs Performance Indexes
-- ==============================================================================

-- Composite index for getUserActivity/getAdminUserActivity queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
ON audit_logs(user_id, created_at DESC);

-- Index for action filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs(action);

-- Index for entity filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
ON audit_logs(entity);

-- Composite index for entity-specific audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_entity_id
ON audit_logs(entity, entity_id);

-- ==============================================================================
-- User Encryption Keys Indexes
-- ==============================================================================

-- Composite index for getUserEncryptionKey query
CREATE INDEX IF NOT EXISTS idx_user_encryption_keys_user_version
ON user_encryption_keys(user_id, key_version DESC);

-- ==============================================================================
-- User Settings Indexes
-- ==============================================================================

-- Single column index on user_id (primary key already covers this, but explicit for clarity)
-- No additional indexes needed as user_settings has user_id as PRIMARY KEY

-- ==============================================================================
-- Webhooks Performance Indexes
-- ==============================================================================

-- Composite index for active webhooks by user
CREATE INDEX IF NOT EXISTS idx_webhooks_user_active
ON webhooks(user_id, is_active)
WHERE is_active = true;

-- Index for webhook URL lookups
CREATE INDEX IF NOT EXISTS idx_webhooks_url
ON webhooks(url);

-- ==============================================================================
-- JSONB Indexes for Common Query Patterns
-- ==============================================================================

-- GIN index for campaign params (if you query specific params frequently)
CREATE INDEX IF NOT EXISTS idx_campaigns_params_gin
ON campaigns USING GIN (params);

-- GIN index for token metadata
CREATE INDEX IF NOT EXISTS idx_tokens_metadata_gin
ON tokens USING GIN (metadata);

-- GIN index for pool metadata
CREATE INDEX IF NOT EXISTS idx_pools_metadata_gin
ON pools USING GIN (metadata);

-- GIN index for job payload (for queue filtering)
CREATE INDEX IF NOT EXISTS idx_jobs_payload_gin
ON jobs USING GIN (payload);

-- ==============================================================================
-- Covering Indexes for Admin Queries
-- ==============================================================================

-- Index for admin campaign list with included columns (PostgreSQL 11+)
CREATE INDEX IF NOT EXISTS idx_campaigns_admin_list
ON campaigns(status, user_id, created_at DESC)
INCLUDE (name, updated_at);

-- ==============================================================================
-- Additional Optimization: VACUUM and ANALYZE
-- ==============================================================================

-- After creating indexes, analyze tables to update statistics
ANALYZE profiles;
ANALYZE wallets;
ANALYZE tokens;
ANALYZE pools;
ANALYZE campaigns;
ANALYZE campaign_runs;
ANALYZE jobs;
ANALYZE executions;
ANALYZE audit_logs;
ANALYZE user_encryption_keys;
ANALYZE user_settings;
ANALYZE webhooks;

-- ==============================================================================
-- Index Usage Notes
-- ==============================================================================

-- To monitor index usage, run:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- ORDER BY idx_scan ASC;

-- To find unused indexes (idx_scan = 0):
-- SELECT schemaname, tablename, indexname
-- FROM pg_stat_user_indexes
-- WHERE idx_scan = 0
-- AND indexname NOT LIKE 'pg_toast%';

-- To check index sizes:
-- SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- ORDER BY pg_relation_size(indexrelid) DESC;
