import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import type { MeResponse } from '../../types'
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard'
import { CurrentUser } from '../../decorators/user.decorator'

@ApiTags('User')
@ApiBearerAuth('JWT-auth')
@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class MeController {
    @Get()
    @ApiOperation({ summary: 'Get current user', description: 'Get information about the authenticated user' })
    @ApiResponse({ status: 200, description: 'User information retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    getMe(@CurrentUser() user: any): MeResponse {
        return {
            id: user.id,
            email: user.email,
            role: (user.user_metadata?.role as 'user' | 'admin') || 'user',
        }
    }
}
