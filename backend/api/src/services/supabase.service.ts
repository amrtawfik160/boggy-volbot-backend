import { Injectable } from '@nestjs/common'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

@Injectable()
export class SupabaseService {
    private supabase: SupabaseClient

    constructor() {
        this.supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
    }

    getClient(): SupabaseClient {
        return this.supabase
    }

    // Tokens
    async getTokens() {
        const { data, error } = await this.supabase.from('tokens').select('*').order('created_at', { ascending: false })

        if (error) throw error
        return data
    }

    async getTokenById(id: string) {
        const { data, error } = await this.supabase.from('tokens').select('*').eq('id', id).single()

        if (error) throw error
        return data
    }

    async getTokenByMint(mint: string) {
        const { data, error } = await this.supabase.from('tokens').select('*').eq('mint', mint).single()

        if (error) throw error
        return data
    }

    async createToken(tokenData: { mint: string; symbol: string; decimals: number; metadata?: any }) {
        const { data, error } = await this.supabase.from('tokens').insert(tokenData).select().single()

        if (error) throw error
        return data
    }

    // Pools
    async getPoolsByTokenId(tokenId: string) {
        const { data, error } = await this.supabase.from('pools').select('*').eq('token_id', tokenId)

        if (error) throw error
        return data
    }

    async createPool(poolData: { token_id: string; pool_address: string; dex: string; metadata?: any }) {
        const { data, error } = await this.supabase.from('pools').insert(poolData).select().single()

        if (error) throw error
        return data
    }

    // Wallets
    async getWalletsByUserId(userId: string) {
        const { data, error } = await this.supabase
            .from('wallets')
            .select('id, user_id, address, label, is_active, created_at, updated_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) throw error
        return data
    }

    async getWalletById(id: string, userId: string) {
        const { data, error } = await this.supabase
            .from('wallets')
            .select('id, user_id, address, label, is_active, created_at, updated_at')
            .eq('id', id)
            .eq('user_id', userId)
            .single()

        if (error) throw error
        return data
    }

    async createWallet(walletData: { user_id: string; address: string; encrypted_private_key?: Buffer; label?: string; is_active?: boolean }) {
        const { data, error } = await this.supabase
            .from('wallets')
            .insert(walletData)
            .select('id, user_id, address, label, is_active, created_at, updated_at')
            .single()

        if (error) throw error
        return data
    }

    async updateWallet(
        id: string,
        userId: string,
        updates: {
            label?: string
            is_active?: boolean
        }
    ) {
        const { data, error } = await this.supabase
            .from('wallets')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select('id, user_id, address, label, is_active, created_at, updated_at')
            .single()

        if (error) throw error
        return data
    }

    async deleteWallet(id: string, userId: string) {
        const { error } = await this.supabase.from('wallets').delete().eq('id', id).eq('user_id', userId)

        if (error) throw error
    }

    async getWalletsByUserIdWithPrivateKeys(userId: string) {
        const { data, error } = await this.supabase
            .from('wallets')
            .select('id, user_id, address, encrypted_private_key, label, is_active, created_at, updated_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) throw error
        return data
    }

    async updateWalletPrivateKey(walletId: string, encryptedPrivateKey: Buffer) {
        const { error } = await this.supabase
            .from('wallets')
            .update({ encrypted_private_key: encryptedPrivateKey })
            .eq('id', walletId)

        if (error) throw error
    }

    // User Encryption Keys
    async getUserEncryptionKey(userId: string) {
        const { data, error } = await this.supabase
            .from('user_encryption_keys')
            .select('*')
            .eq('user_id', userId)
            .order('key_version', { ascending: false })
            .limit(1)
            .single()

        if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
        return data
    }

    async createUserEncryptionKey(keyData: { user_id: string; encrypted_dek: Buffer; key_version: number }) {
        const { data, error } = await this.supabase.from('user_encryption_keys').insert(keyData).select().single()

        if (error) throw error
        return data
    }

    async updateUserEncryptionKey(userId: string, updates: { encrypted_dek: Buffer; key_version: number }) {
        const { data, error } = await this.supabase
            .from('user_encryption_keys')
            .update(updates)
            .eq('user_id', userId)
            .select()
            .single()

        if (error) throw error
        return data
    }

    async deleteUserEncryptionKey(userId: string) {
        const { error } = await this.supabase.from('user_encryption_keys').delete().eq('user_id', userId)

        if (error) throw error
    }

    // Campaigns
    async getCampaignsByUserId(userId: string) {
        const { data, error } = await this.supabase
            .from('campaigns')
            .select(
                `
        *,
        tokens:token_id (mint, symbol, decimals),
        pools:pool_id (pool_address, dex)
      `
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) throw error
        return data
    }

    async getCampaignById(id: string, userId: string) {
        const { data, error } = await this.supabase
            .from('campaigns')
            .select(
                `
        *,
        tokens:token_id (mint, symbol, decimals),
        pools:pool_id (pool_address, dex)
      `
            )
            .eq('id', id)
            .eq('user_id', userId)
            .single()

        if (error) throw error
        return data
    }

    async createCampaign(campaignData: { user_id: string; name: string; token_id: string; pool_id: string; params: any; status?: string }) {
        const { data, error } = await this.supabase.from('campaigns').insert(campaignData).select().single()

        if (error) throw error
        return data
    }

    async updateCampaign(
        id: string,
        userId: string,
        updates: {
            name?: string
            params?: any
            status?: string
        }
    ) {
        const { data, error } = await this.supabase.from('campaigns').update(updates).eq('id', id).eq('user_id', userId).select().single()

        if (error) throw error
        return data
    }

    // Campaign Runs
    async createCampaignRun(runData: { campaign_id: string; started_at?: Date; status?: string }) {
        const { data, error } = await this.supabase.from('campaign_runs').insert(runData).select().single()

        if (error) throw error
        return data
    }

    async updateCampaignRun(
        id: string,
        updates: {
            ended_at?: Date
            status?: string
            summary?: any
        }
    ) {
        const { data, error } = await this.supabase.from('campaign_runs').update(updates).eq('id', id).select().single()

        if (error) throw error
        return data
    }

    async getCampaignRunsByCampaignId(campaignId: string) {
        const { data, error } = await this.supabase
            .from('campaign_runs')
            .select('*')
            .eq('campaign_id', campaignId)
            .order('started_at', { ascending: false })

        if (error) throw error
        return data
    }

    // Jobs
    async createJob(jobData: { run_id: string; queue: string; type: string; payload: any; status?: string }) {
        const { data, error } = await this.supabase.from('jobs').insert(jobData).select().single()

        if (error) throw error
        return data
    }

    async updateJob(
        id: string,
        updates: {
            status?: string
            attempts?: number
            error?: any
        }
    ) {
        const { data, error } = await this.supabase.from('jobs').update(updates).eq('id', id).select().single()

        if (error) throw error
        return data
    }

    // Executions
    async createExecution(executionData: { job_id: string; tx_signature: string; latency_ms?: number; result?: any }) {
        const { data, error } = await this.supabase.from('executions').insert(executionData).select().single()

        if (error) throw error
        return data
    }

    async logExecution(executionData: { job_id: string; tx_signature?: string; result?: any }) {
        return this.createExecution({
            ...executionData,
            tx_signature: executionData.tx_signature || 'unknown',
        })
    }

    async getPoolById(id: string) {
        const { data, error } = await this.supabase.from('pools').select('*').eq('id', id).single()

        if (error) throw error
        return data
    }

    async updateToken(id: string, updates: { symbol?: string; metadata?: any }) {
        const { data, error } = await this.supabase.from('tokens').update(updates).eq('id', id).select().single()

        if (error) throw error
        return data
    }

    async deleteToken(id: string) {
        const { error } = await this.supabase.from('tokens').delete().eq('id', id)

        if (error) throw error
    }

    // Dashboard metrics
    async getRecentExecutions(userId: string, since: Date) {
        // Get user's campaigns
        const { data: campaigns } = await this.supabase.from('campaigns').select('id').eq('user_id', userId)

        if (!campaigns || campaigns.length === 0) return []

        const campaignIds = campaigns.map(c => c.id)

        // Get runs for those campaigns
        const { data: runs } = await this.supabase.from('campaign_runs').select('id').in('campaign_id', campaignIds)

        if (!runs || runs.length === 0) return []

        const runIds = runs.map(r => r.id)

        // Get jobs for those runs
        const { data: jobs } = await this.supabase.from('jobs').select('id').in('run_id', runIds)

        if (!jobs || jobs.length === 0) return []

        const jobIds = jobs.map(j => j.id)

        // Get executions
        const { data: executions, error } = await this.supabase
            .from('executions')
            .select('*')
            .in('job_id', jobIds)
            .gte('created_at', since.toISOString())
            .order('created_at', { ascending: false })

        if (error) throw error
        return executions || []
    }

    async getRecentActivity(userId: string, limit: number) {
        const { data, error } = await this.supabase
            .from('audit_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) throw error
        return data || []
    }

    async getCampaignLogs(campaignId: string, limit: number) {
        // Get runs for campaign
        const { data: runs } = await this.supabase.from('campaign_runs').select('id').eq('campaign_id', campaignId)

        if (!runs || runs.length === 0) return []

        const runIds = runs.map(r => r.id)

        // Get jobs
        const { data: jobs } = await this.supabase.from('jobs').select('id').in('run_id', runIds)

        if (!jobs || jobs.length === 0) return []

        const jobIds = jobs.map(j => j.id)

        // Get executions
        const { data: executions, error } = await this.supabase
            .from('executions')
            .select('*')
            .in('job_id', jobIds)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) throw error
        return executions || []
    }

    // ============ User Settings ============
    async getUserSettings(userId: string) {
        const { data, error } = await this.supabase.from('user_settings').select('*').eq('user_id', userId).single()
        if (error && error.code !== 'PGRST116') throw error // single() no rows
        return data || null
    }

    async upsertUserSettings(
        userId: string,
        settings: {
            trading_config?: any
            sell_config?: any
            jito_config?: any
        }
    ) {
        // Ensure row exists or insert
        const existing = await this.getUserSettings(userId)
        if (!existing) {
            const { data, error } = await this.supabase
                .from('user_settings')
                .insert({ user_id: userId, ...settings })
                .select('*')
                .single()
            if (error) throw error
            return data
        }
        const { data, error } = await this.supabase.from('user_settings').update(settings).eq('user_id', userId).select('*').single()
        if (error) throw error
        return data
    }
}
