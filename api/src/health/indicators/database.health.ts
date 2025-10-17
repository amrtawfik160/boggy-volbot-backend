import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

/**
 * Database (Supabase) health indicator
 * Checks if database connection is available and responsive
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
    private supabase: SupabaseClient;

    constructor() {
        super();
        this.supabase = createClient(
            process.env.SUPABASE_URL || 'http://localhost:54321',
            process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'
        );
    }

    async isHealthy(key: string): Promise<HealthIndicatorResult> {
        try {
            const startTime = Date.now();

            // Test database connection with a simple query
            const { data, error } = await this.supabase
                .from('users')
                .select('count', { count: 'exact', head: true });

            const latency = Date.now() - startTime;

            if (error) {
                throw error;
            }

            const result = this.getStatus(key, true, {
                status: 'up',
                latency: `${latency}ms`,
                connection: 'connected',
            });

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const result = this.getStatus(key, false, {
                status: 'down',
                message: errorMessage,
                connection: 'disconnected',
            });

            throw new HealthCheckError('Database check failed', result);
        }
    }
}
