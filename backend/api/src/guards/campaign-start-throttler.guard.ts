import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

/**
 * Strict rate limiter for campaign start endpoint
 * Limit: 5 requests per minute per user
 */
@Injectable()
export class CampaignStartThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {
        // Rate limit by user ID
        return req.user?.id || req.ip
    }
}
