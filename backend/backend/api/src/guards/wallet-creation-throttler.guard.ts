import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

/**
 * Strict rate limiter for wallet creation endpoint
 * Limit: 10 requests per minute per user
 */
@Injectable()
export class WalletCreationThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {
        // Rate limit by user ID
        return req.user?.id || req.ip
    }
}
