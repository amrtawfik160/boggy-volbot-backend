import { Body, Controller, Get, Post, Delete, Patch, Query, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard';
import { CurrentUser } from '../../decorators/user.decorator';
import { SupabaseService } from '../../services/supabase.service';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenMetadata } from '../../services/token-metadata.service';
import { CreateTokenDto, UpdateTokenDto, CreatePoolDto } from './dto';

@ApiTags('Tokens')
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
  @ApiOperation({ summary: 'List all tokens', description: 'Get all tokens in the system' })
  @ApiResponse({ status: 200, description: 'Tokens retrieved successfully' })
  async listTokens() {
    return await this.supabase.getTokens();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get token by ID', description: 'Retrieve a specific token by its ID' })
  @ApiParam({ name: 'id', description: 'Token ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Token retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async getToken(@Param('id') id: string) {
    return await this.supabase.getTokenById(id);
  }

  @Post()
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create new token', description: 'Create a new token entry (returns existing if already exists)' })
  @ApiResponse({ status: 201, description: 'Token created successfully' })
  @ApiResponse({ status: 200, description: 'Token already exists' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiOperation({ summary: 'List token pools', description: 'Get all liquidity pools for a specific token' })
  @ApiParam({ name: 'id', description: 'Token ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Pools retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async listPools(@Param('id') tokenId: string) {
    return await this.supabase.getPoolsByTokenId(tokenId);
  }

  @Post(':id/pools')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create pool', description: 'Create a new liquidity pool for a token' })
  @ApiParam({ name: 'id', description: 'Token ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Pool created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async createPool(
    @Param('id') tokenId: string,
    @Body() dto: CreatePoolDto,
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
  @ApiOperation({ summary: 'Fetch token metadata', description: 'Fetch on-chain metadata for a token by its mint address' })
  @ApiParam({ name: 'mint', description: 'Token mint address (Solana public key)' })
  @ApiResponse({ status: 200, description: 'Metadata retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid mint address or metadata not found' })
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
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update token', description: 'Update token details' })
  @ApiParam({ name: 'id', description: 'Token ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Token updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async updateToken(
    @Param('id') id: string,
    @Body() dto: UpdateTokenDto,
    @CurrentUser() user: any
  ) {
    return await this.supabase.updateToken(id, dto);
  }

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete token', description: 'Delete a token permanently' })
  @ApiParam({ name: 'id', description: 'Token ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Token deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async deleteToken(@Param('id') id: string, @CurrentUser() user: any) {
    return await this.supabase.deleteToken(id);
  }
}
