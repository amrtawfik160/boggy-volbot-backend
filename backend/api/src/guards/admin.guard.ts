import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { SupabaseAuthGuard } from './supabase-auth.guard'
import { supabaseAdmin } from '../config/supabase'

@Injectable()
export class AdminGuard extends SupabaseAuthGuard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        // First check authentication using parent guard
        const authenticated = await super.canActivate(context)
        if (!authenticated) {
            return false
        }

        // Then check admin role
        const request = context.switchToHttp().getRequest()
        const user = request.user

        try {
            // Query database for user profile/role
            // Assuming users table has a role column or metadata
            const { data: profile, error } = await supabaseAdmin
                .from('auth.users')
                .select('raw_user_meta_data')
                .eq('id', user.id)
                .single()

            if (error) {
                console.error('Error fetching user profile:', error)
                throw new ForbiddenException('Unable to verify admin access')
            }

            // Check if user has admin role in metadata
            const role = profile?.raw_user_meta_data?.role

            if (role !== 'admin') {
                throw new ForbiddenException('Admin access required')
            }

            return true
        } catch (error) {
            if (error instanceof ForbiddenException) {
                throw error
            }
            throw new ForbiddenException('Admin access verification failed')
        }
    }
}
