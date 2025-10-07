import { Body, Controller, Get, Post, Delete, Patch, Query, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard';
import { CurrentUser } from '../../decorators/user.decorator';
import { SupabaseService } from '../../services/supabase.service';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenMetadata } from '../../services/token-metadata.service';

interface CreateTokenDto {
  mint: string;
  symbol: string;
  decimals: number;
  metadata?: any;
}

interface UpdateTokenDto {
  symbol?: string;
  metadata?: any;
}

@Controller('tokens')
export class TokensController {
  private connection: Connection;

  constructor(private readonly supabase: SupabaseService) {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
  }

  @Get()
  async listTokens() {
    return await this.supabase.getTokens();
  }

  @Get(':id')
  async getToken(@Param('id') id: string) {
    return await this.supabase.getTokenById(id);
  }

  @Post()
  @UseGuards(SupabaseAuthGuard)
  async createToken(@Body() dto: CreateTokenDto, @CurrentUser() user: any) {
    // Check if token already exists
    try {
      const existing = await this.supabase.getTokenByMint(dto.mint);
      if (existing) {
        return existing;
      }
    } catch (error) {
      // Token doesn't exist, continue
    }

    return await this.supabase.createToken(dto);
  }

  @Get(':id/pools')
  async listPools(@Param('id') tokenId: string) {
    return await this.supabase.getPoolsByTokenId(tokenId);
  }

  @Post(':id/pools')
  @UseGuards(SupabaseAuthGuard)
  async createPool(
    @Param('id') tokenId: string,
    @Body() dto: { pool_address: string; dex: string; metadata?: any },
    @CurrentUser() user: any
  ) {
    return await this.supabase.createPool({
      token_id: tokenId,
      pool_address: dto.pool_address,
      dex: dto.dex,
      metadata: dto.metadata,
    });
  }

  @Get('metadata/:mint')
  async fetchMetadata(@Param('mint') mint: string) {
    try {
      const metadata = await getTokenMetadata(this.connection, new PublicKey(mint));
      return metadata;
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to fetch token metadata',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Patch(':id')
  @UseGuards(SupabaseAuthGuard)
  async updateToken(
    @Param('id') id: string,
    @Body() dto: UpdateTokenDto,
    @CurrentUser() user: any
  ) {
    return await this.supabase.updateToken(id, dto);
  }

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard)
  async deleteToken(@Param('id') id: string, @CurrentUser() user: any) {
    return await this.supabase.deleteToken(id);
  }
}
