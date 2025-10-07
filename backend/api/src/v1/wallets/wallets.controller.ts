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
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard';
import { CurrentUser } from '../../decorators/user.decorator';
import { SupabaseService } from '../../services/supabase.service';
import { KeyManagementService } from '../../services/key-management.service';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

interface CreateWalletDto {
  address?: string;
  privateKey?: string;
  label?: string;
}

interface UpdateWalletDto {
  label?: string;
  is_active?: boolean;
}

@Controller('wallets')
@UseGuards(SupabaseAuthGuard)
export class WalletsController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly keyManagement: KeyManagementService,
  ) {}

  @Get()
  async listWallets(@CurrentUser() user: any) {
    return await this.supabase.getWalletsByUserId(user.id);
  }

  @Get(':id')
  async getWallet(@Param('id') id: string, @CurrentUser() user: any) {
    return await this.supabase.getWalletById(id, user.id);
  }

  @Post()
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
  async updateWallet(
    @Param('id') id: string,
    @Body() dto: UpdateWalletDto,
    @CurrentUser() user: any
  ) {
    return await this.supabase.updateWallet(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWallet(@Param('id') id: string, @CurrentUser() user: any) {
    await this.supabase.deleteWallet(id, user.id);
  }
}

