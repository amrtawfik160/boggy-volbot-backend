import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard';
import { CurrentUser } from '../../decorators/user.decorator';
import { SupabaseService } from '../../services/supabase.service';
import { KeyManagementService } from '../../services/key-management.service';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { CreateWalletDto, UpdateWalletDto } from './dto';

@ApiTags('Wallets')
@ApiBearerAuth('JWT-auth')
@Controller('wallets')
@UseGuards(SupabaseAuthGuard)
export class WalletsController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly keyManagement: KeyManagementService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all wallets', description: 'Get all wallets for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Wallets retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listWallets(@CurrentUser() user: any) {
    return await this.supabase.getWalletsByUserId(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get wallet by ID', description: 'Retrieve a specific wallet by its ID' })
  @ApiParam({ name: 'id', description: 'Wallet ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Wallet retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWallet(@Param('id') id: string, @CurrentUser() user: any) {
    return await this.supabase.getWalletById(id, user.id);
  }

  @Post()
  @Throttle({ 'wallet-creation': { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create new wallet', description: 'Create a new wallet with address or private key' })
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data or private key format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests (max 10 per minute)' })
  async createWallet(@Body() dto: CreateWalletDto, @CurrentUser() user: any) {
    let address: string;
    let encryptedPrivateKey: Buffer | undefined;

    if (dto.privateKey) {
      // Validate and encrypt private key
      try {
        const privateKeyBytes = bs58.decode(dto.privateKey);
        const keypair = Keypair.fromSecretKey(privateKeyBytes);
        address = keypair.publicKey.toString();

        // Encrypt the private key with user's DEK
        encryptedPrivateKey = await this.keyManagement.encryptPrivateKeyForUser(
          user.id,
          dto.privateKey,
        );
      } catch (error) {
        throw new Error('Invalid private key format');
      }
    } else if (dto.address) {
      // Read-only wallet (no private key)
      address = dto.address;

      // Validate it's a valid Solana address
      try {
        // Basic validation - Solana addresses are base58 and 32-44 chars
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
          throw new Error('Invalid address format');
        }
      } catch (error) {
        throw new Error('Invalid wallet address');
      }
    } else {
      throw new Error('Either address or privateKey must be provided');
    }

    const wallet = await this.supabase.createWallet({
      user_id: user.id,
      address,
      encrypted_private_key: encryptedPrivateKey,
      label: dto.label,
      is_active: true,
    });

    return wallet;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update wallet', description: 'Update wallet details (label, is_active)' })
  @ApiParam({ name: 'id', description: 'Wallet ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Wallet updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async updateWallet(
    @Param('id') id: string,
    @Body() dto: UpdateWalletDto,
    @CurrentUser() user: any
  ) {
    return await this.supabase.updateWallet(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete wallet', description: 'Delete a wallet permanently' })
  @ApiParam({ name: 'id', description: 'Wallet ID (UUID)' })
  @ApiResponse({ status: 204, description: 'Wallet deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async deleteWallet(@Param('id') id: string, @CurrentUser() user: any) {
    await this.supabase.deleteWallet(id, user.id);
  }
}

