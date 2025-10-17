import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletsController } from '../wallets.controller';
import { SupabaseService } from '../../../services/supabase.service';
import { KeyManagementService } from '../../../services/key-management.service';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

describe('WalletsController Integration Tests', () => {
  let controller: WalletsController;
  let supabaseService: SupabaseService;
  let keyManagementService: KeyManagementService;

  const mockUser = { id: 'test-user-123' };

  const mockSupabaseService = {
    getWalletsByUserId: vi.fn(),
    getWalletById: vi.fn(),
    createWallet: vi.fn(),
    updateWallet: vi.fn(),
    deleteWallet: vi.fn(),
  };

  const mockKeyManagementService = {
    encryptPrivateKeyForUser: vi.fn(),
  };

  beforeEach(async () => {
    // Manually instantiate controller with mocked dependencies
    controller = new WalletsController(
      mockSupabaseService as any,
      mockKeyManagementService as any
    );
    supabaseService = mockSupabaseService as any;
    keyManagementService = mockKeyManagementService as any;

    vi.clearAllMocks();
  });

  describe('listWallets', () => {
    it('should return all wallets for a user', async () => {
      const mockWallets = [
        { id: 'w1', address: 'addr1', label: 'Wallet 1', is_active: true },
        { id: 'w2', address: 'addr2', label: 'Wallet 2', is_active: true },
      ];

      mockSupabaseService.getWalletsByUserId.mockResolvedValue(mockWallets);

      const result = await controller.listWallets(mockUser);

      expect(result).toEqual(mockWallets);
      expect(mockSupabaseService.getWalletsByUserId).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return empty array when user has no wallets', async () => {
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);

      const result = await controller.listWallets(mockUser);

      expect(result).toEqual([]);
    });
  });

  describe('getWallet', () => {
    it('should return a specific wallet by id', async () => {
      const mockWallet = { id: 'w1', address: 'addr1', label: 'My Wallet' };

      mockSupabaseService.getWalletById.mockResolvedValue(mockWallet);

      const result = await controller.getWallet('w1', mockUser);

      expect(result).toEqual(mockWallet);
      expect(mockSupabaseService.getWalletById).toHaveBeenCalledWith('w1', mockUser.id);
    });
  });

  describe('createWallet', () => {
    it('should create wallet with private key and encrypt it', async () => {
      // Generate a valid keypair for testing
      const keypair = Keypair.generate();
      const privateKeyBase58 = bs58.encode(keypair.secretKey);
      const encryptedKey = Buffer.from('encrypted-key-data');

      const dto = {
        privateKey: privateKeyBase58,
        label: 'Test Wallet',
      };

      const mockCreatedWallet = {
        id: 'w1',
        user_id: mockUser.id,
        address: keypair.publicKey.toString(),
        encrypted_private_key: encryptedKey,
        label: 'Test Wallet',
        is_active: true,
      };

      mockKeyManagementService.encryptPrivateKeyForUser.mockResolvedValue(encryptedKey);
      mockSupabaseService.createWallet.mockResolvedValue(mockCreatedWallet);

      const result = await controller.createWallet(dto, mockUser);

      expect(result).toEqual(mockCreatedWallet);
      expect(mockKeyManagementService.encryptPrivateKeyForUser).toHaveBeenCalledWith(
        mockUser.id,
        privateKeyBase58
      );
      expect(mockSupabaseService.createWallet).toHaveBeenCalledWith({
        user_id: mockUser.id,
        address: keypair.publicKey.toString(),
        encrypted_private_key: encryptedKey,
        label: 'Test Wallet',
        is_active: true,
      });
    });

    it('should create read-only wallet with just address', async () => {
      const validAddress = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
      const dto = {
        address: validAddress,
        label: 'Read-Only Wallet',
      };

      const mockCreatedWallet = {
        id: 'w2',
        user_id: mockUser.id,
        address: validAddress,
        encrypted_private_key: undefined,
        label: 'Read-Only Wallet',
        is_active: true,
      };

      mockSupabaseService.createWallet.mockResolvedValue(mockCreatedWallet);

      const result = await controller.createWallet(dto, mockUser);

      expect(result).toEqual(mockCreatedWallet);
      expect(mockKeyManagementService.encryptPrivateKeyForUser).not.toHaveBeenCalled();
      expect(mockSupabaseService.createWallet).toHaveBeenCalledWith({
        user_id: mockUser.id,
        address: validAddress,
        encrypted_private_key: undefined,
        label: 'Read-Only Wallet',
        is_active: true,
      });
    });

    it('should throw error for invalid private key', async () => {
      const dto = {
        privateKey: 'invalid-key',
        label: 'Test Wallet',
      };

      await expect(controller.createWallet(dto, mockUser)).rejects.toThrow(
        'Invalid private key format'
      );
    });

    it('should throw error for invalid address format', async () => {
      const dto = {
        address: 'invalid-address-123',
        label: 'Test Wallet',
      };

      await expect(controller.createWallet(dto, mockUser)).rejects.toThrow(
        'Invalid wallet address'
      );
    });

    it('should throw error when neither address nor privateKey provided', async () => {
      const dto = {
        label: 'Test Wallet',
      };

      await expect(controller.createWallet(dto as any, mockUser)).rejects.toThrow(
        'Either address or privateKey must be provided'
      );
    });
  });

  describe('updateWallet', () => {
    it('should update wallet with new data', async () => {
      const dto = {
        label: 'Updated Wallet',
        is_active: false,
      };

      const mockUpdatedWallet = {
        id: 'w1',
        address: 'addr1',
        label: 'Updated Wallet',
        is_active: false,
      };

      mockSupabaseService.updateWallet.mockResolvedValue(mockUpdatedWallet);

      const result = await controller.updateWallet('w1', dto, mockUser);

      expect(result).toEqual(mockUpdatedWallet);
      expect(mockSupabaseService.updateWallet).toHaveBeenCalledWith('w1', mockUser.id, dto);
    });
  });

  describe('deleteWallet', () => {
    it('should delete a wallet', async () => {
      mockSupabaseService.deleteWallet.mockResolvedValue(undefined);

      await controller.deleteWallet('w1', mockUser);

      expect(mockSupabaseService.deleteWallet).toHaveBeenCalledWith('w1', mockUser.id);
    });
  });
});
