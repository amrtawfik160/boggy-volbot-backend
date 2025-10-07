import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common'
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard'
import { CurrentUser } from '../../decorators/user.decorator'
import { SupabaseService } from '../../services/supabase.service'

interface UpdateSettingsDto {
    trading_config?: any
    sell_config?: any
    jito_config?: any
}

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
    async updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: any) {
        const updated = await this.supabase.upsertUserSettings(user.id, dto)
        return updated
    }
}
