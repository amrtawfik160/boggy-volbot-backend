import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { supabaseAdmin } from '../config/supabase'

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const authHeader = request.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Missing or invalid authorization header')
        }

        const token = authHeader.substring(7)

        try {
            const { data, error } = await supabaseAdmin.auth.getUser(token)

            if (error || !data.user) {
                throw new UnauthorizedException('Invalid or expired token')
            }

            // Attach user to request
            request.user = data.user
            return true
        } catch (error) {
            throw new UnauthorizedException('Authentication failed')
        }
    }
}
