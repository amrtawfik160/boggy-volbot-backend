import { Controller, Get, Patch, Body, UseGuards, UsePipes, ValidationPipe, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard'
import { CurrentUser } from '../../decorators/user.decorator'
import { SupabaseService } from '../../services/supabase.service'
import { UpdateSettingsDto } from './dto'

@ApiTags('Settings')
@ApiBearerAuth('JWT-auth')
@Controller('settings')
@UseGuards(SupabaseAuthGuard)
export class SettingsController {
    constructor(private readonly supabase: SupabaseService) {}

    @Get()
    @ApiOperation({ summary: 'Get user settings', description: 'Get trading, sell, and Jito configuration settings for the authenticated user' })
    @ApiResponse({ status: 200, description: 'Settings retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getSettings(@CurrentUser() user: any) {
        const settings = await this.supabase.getUserSettings(user.id)
        return settings || { user_id: user.id, trading_config: null, sell_config: null, jito_config: null }
    }

    @Patch()
    @UsePipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        validateCustomDecorators: true
    }))
    @ApiOperation({ summary: 'Update user settings', description: 'Update trading, sell, and Jito configuration settings' })
    @ApiResponse({ status: 200, description: 'Settings updated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data (jitoKey required when useJito is true)' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: any) {
        // Additional validation: if jito is enabled, ensure jitoKey is provided
        if (dto.jito_config?.useJito === true && !dto.jito_config?.jitoKey) {
            throw new BadRequestException('jitoKey is required when useJito is true')
        }

        const updated = await this.supabase.upsertUserSettings(user.id, dto)
        return updated
    }
}
