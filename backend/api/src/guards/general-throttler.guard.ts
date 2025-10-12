import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

/**
 * General rate limiter for all API endpoints
 * Limit: 100 requests per minute per user
 */
@Injectable()
export class GeneralThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {
        // Rate limit by user ID, fallback to IP
        return req.user?.id || req.ip
    }
}
