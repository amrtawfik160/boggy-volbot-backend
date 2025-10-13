import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { Connection } from '@solana/web3.js';

/**
 * RPC Provider health indicator
 * Checks if Solana RPC connection is available and responsive
 * Note: RPC failures should not bring down the entire service
 */
@Injectable()
export class RpcHealthIndicator extends HealthIndicator {
    private connections: Map<string, Connection> = new Map();
    private readonly rpcEndpoints: string[];

    constructor() {
        super();
        // Configure multiple RPC endpoints for redundancy
        this.rpcEndpoints = [
            process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
            process.env.SOLANA_RPC_FALLBACK_URL || 'https://api.mainnet-beta.solana.com',
        ].filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates

        // Initialize connections
        this.rpcEndpoints.forEach(endpoint => {
            this.connections.set(endpoint, new Connection(endpoint, {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 60000,
            }));
        });
    }

    async isHealthy(key: string, degradedAllowed = true): Promise<HealthIndicatorResult> {
        const results: Array<{
            endpoint: string;
            status: 'up' | 'down';
            latency?: string;
            version?: string;
            slot?: number;
            error?: string;
        }> = [];

        let healthyCount = 0;

        // Check all RPC endpoints
        const connectionEntries = Array.from(this.connections.entries());
        for (const [endpoint, connection] of connectionEntries) {
            try {
                const startTime = Date.now();

                // Test RPC with multiple calls
                const [version, slot] = await Promise.all([
                    connection.getVersion(),
                    connection.getSlot(),
                ]);

                const latency = Date.now() - startTime;

                results.push({
                    endpoint: this.maskEndpoint(endpoint),
                    status: 'up',
                    latency: `${latency}ms`,
                    version: version['solana-core'],
                    slot,
                });

                healthyCount++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                results.push({
                    endpoint: this.maskEndpoint(endpoint),
                    status: 'down',
                    error: errorMessage,
                });
            }
        }

        const totalEndpoints = this.rpcEndpoints.length;
        const isFullyHealthy = healthyCount === totalEndpoints;
        const isDegraded = healthyCount > 0 && healthyCount < totalEndpoints;
        const isDown = healthyCount === 0;

        // Determine overall status
        if (isDown) {
            const result = this.getStatus(key, false, {
                status: 'down',
                message: 'All RPC providers are unavailable',
                healthy: healthyCount,
                total: totalEndpoints,
                providers: results,
            });
            throw new HealthCheckError('RPC check failed - all providers down', result);
        }

        if (isDegraded && !degradedAllowed) {
            const result = this.getStatus(key, false, {
                status: 'degraded',
                message: 'Some RPC providers are unavailable',
                healthy: healthyCount,
                total: totalEndpoints,
                providers: results,
            });
            throw new HealthCheckError('RPC check degraded', result);
        }

        // Return healthy or degraded status
        const result = this.getStatus(key, true, {
            status: isDegraded ? 'degraded' : 'up',
            message: isDegraded ? 'Some RPC providers are unavailable but service continues' : undefined,
            healthy: healthyCount,
            total: totalEndpoints,
            providers: results,
        });

        return result;
    }

    /**
     * Mask sensitive parts of RPC endpoint URLs
     */
    private maskEndpoint(endpoint: string): string {
        try {
            const url = new URL(endpoint);
            // Mask API keys in query params or path
            if (url.searchParams.size > 0) {
                return `${url.protocol}//${url.host}/***`;
            }
            return `${url.protocol}//${url.host}${url.pathname}`;
        } catch {
            return '***';
        }
    }
}
