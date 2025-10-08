import { Controller, Get, Patch, Body, UseGuards, UsePipes, ValidationPipe, BadRequestException } from '@nestjs/common'
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard'
import { CurrentUser } from '../../decorators/user.decorator'
import { SupabaseService } from '../../services/supabase.service'
import { UpdateSettingsDto } from './dto'

@Controller('settings')
@UseGuards(SupabaseAuthGuard)
export class SettingsController {
    constructor(private readonly supabase: SupabaseService) {}

    @Get()
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
    async updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: any) {
        // Additional validation: if jito is enabled, ensure jitoKey is provided
        if (dto.jito_config?.useJito === true && !dto.jito_config?.jitoKey) {
            throw new BadRequestException('jitoKey is required when useJito is true')
        }

        const updated = await this.supabase.upsertUserSettings(user.id, dto)
        return updated
    }
}
