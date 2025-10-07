import { Controller, Get, UseGuards } from '@nestjs/common'
import type { MeResponse } from '../../types'
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard'
import { CurrentUser } from '../../decorators/user.decorator'

@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class MeController {
    @Get()
    getMe(@CurrentUser() user: any): MeResponse {
        return {
            id: user.id,
            email: user.email,
            role: (user.user_metadata?.role as 'user' | 'admin') || 'user',
        }
    }
}
