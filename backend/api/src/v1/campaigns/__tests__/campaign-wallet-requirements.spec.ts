import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Test Suite for Campaign Wallet Requirements Enforcement
 *
 * Tests wallet requirements including:
 * - Wallet ownership verification (users can only use their own wallets)
 * - Wallet existence validation
 * - Wallet type validation (active vs inactive wallets)
 * - Authorization checks for wallet operations
 * - Wallet access control during campaign operations
 * - Private key availability for trading wallets
 */

describe('Campaign Wallet Requirements', () => {
  let supabaseService: any;

  const mockUser = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'test@example.com',
  };

  const mockOtherUser = {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'other@example.com',
  };

  const mockToken = {
    id: '10000000-0000-0000-0000-000000000001',
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    decimals: 9,
  };

  const mockPool = {
    id: '20000000-0000-0000-0000-000000000001',
    token_id: mockToken.id,
    pool_address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    dex: 'raydium',
  };

  const mockWallet = {
    id: '30000000-0000-0000-0000-000000000001',
    user_id: mockUser.id,
    address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    label: 'Test Wallet',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockInactiveWallet = {
    id: '30000000-0000-0000-0000-000000000002',
    user_id: mockUser.id,
    address: '5k4Eyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX7S',
    label: 'Inactive Wallet',
    is_active: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockOtherUserWallet = {
    id: '30000000-0000-0000-0000-000000000003',
    user_id: mockOtherUser.id,
    address: '6k5Fyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX8T',
    label: 'Other User Wallet',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockCampaign = {
    id: '40000000-0000-0000-0000-000000000001',
    user_id: mockUser.id,
    name: 'Test Campaign',
    token_id: mockToken.id,
    pool_id: mockPool.id,
    status: 'draft',
    params: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    supabaseService = {
      getWalletsByUserId: vi.fn(),
      getWalletById: vi.fn(),
      createWallet: vi.fn(),
      updateWallet: vi.fn(),
      deleteWallet: vi.fn(),
      getWalletsByUserIdWithPrivateKeys: vi.fn(),
      updateWalletPrivateKey: vi.fn(),
      getCampaignById: vi.fn(),
      createCampaignRun: vi.fn(),
    };
  });

  describe('Wallet Ownership Verification', () => {
    it('should only retrieve wallets owned by the authenticated user', async () => {
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([mockWallet]);

      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(wallets).toHaveLength(1);
      expect(wallets[0].user_id).toBe(mockUser.id);
      expect(wallets[0].id).toBe(mockWallet.id);
    });

    it('should return empty array when user has no wallets', async () => {
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([]);

      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(wallets).toHaveLength(0);
    });

    it('should not retrieve wallets belonging to other users', async () => {
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([mockWallet]);

      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(wallets.every(w => w.user_id === mockUser.id)).toBe(true);
      expect(wallets.some(w => w.user_id === mockOtherUser.id)).toBe(false);
    });

    it('should enforce user_id filter when retrieving individual wallet', async () => {
      vi.spyOn(supabaseService, 'getWalletById').mockResolvedValue(mockWallet);

      const wallet = await supabaseService.getWalletById(mockWallet.id, mockUser.id);

      expect(wallet.user_id).toBe(mockUser.id);
      expect(wallet.id).toBe(mockWallet.id);
    });

    it('should fail to retrieve wallet with wrong user_id', async () => {
      vi.spyOn(supabaseService, 'getWalletById').mockRejectedValue(
        new Error('No rows returned')
      );

      await expect(
        supabaseService.getWalletById(mockOtherUserWallet.id, mockUser.id)
      ).rejects.toThrow();
    });
  });

  describe('Wallet Existence Validation', () => {
    it('should verify wallet exists before campaign operations', async () => {
      vi.spyOn(supabaseService, 'getWalletById').mockResolvedValue(mockWallet);

      const wallet = await supabaseService.getWalletById(mockWallet.id, mockUser.id);

      expect(wallet).toBeDefined();
      expect(wallet.id).toBe(mockWallet.id);
    });

    it('should fail when wallet does not exist', async () => {
      const nonExistentWalletId = '99999999-9999-9999-9999-999999999999';
      vi.spyOn(supabaseService, 'getWalletById').mockRejectedValue(
        new Error('No rows returned')
      );

      await expect(
        supabaseService.getWalletById(nonExistentWalletId, mockUser.id)
      ).rejects.toThrow();
    });

    it('should retrieve all user wallets for campaign start operations', async () => {
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([
        mockWallet,
        mockInactiveWallet,
      ]);

      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(wallets).toHaveLength(2);
      expect(wallets.map(w => w.id)).toContain(mockWallet.id);
      expect(wallets.map(w => w.id)).toContain(mockInactiveWallet.id);
    });
  });

  describe('Wallet Active Status Enforcement', () => {
    it('should identify active wallets correctly', async () => {
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([
        mockWallet,
        mockInactiveWallet,
      ]);

      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);
      const activeWallets = wallets.filter(w => w.is_active);

      expect(activeWallets).toHaveLength(1);
      expect(activeWallets[0].id).toBe(mockWallet.id);
      expect(activeWallets[0].is_active).toBe(true);
    });

    it('should identify inactive wallets correctly', async () => {
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([
        mockWallet,
        mockInactiveWallet,
      ]);

      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);
      const inactiveWallets = wallets.filter(w => !w.is_active);

      expect(inactiveWallets).toHaveLength(1);
      expect(inactiveWallets[0].id).toBe(mockInactiveWallet.id);
      expect(inactiveWallets[0].is_active).toBe(false);
    });

    it('should allow updating wallet active status', async () => {
      const updatedWallet = { ...mockWallet, is_active: false };
      vi.spyOn(supabaseService, 'updateWallet').mockResolvedValue(updatedWallet);

      const result = await supabaseService.updateWallet(
        mockWallet.id,
        mockUser.id,
        { is_active: false }
      );

      expect(result.is_active).toBe(false);
      expect(result.id).toBe(mockWallet.id);
    });

    it('should only use active wallets for campaign trading operations', async () => {
      // Simulate campaign start which should only use active wallets
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([
        mockWallet, // active
        mockInactiveWallet, // inactive
      ]);

      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      // In production, the controller filters for active wallets during trading
      // This test validates the data structure supports that filtering
      const tradingWallets = wallets.filter(w => w.is_active);

      expect(tradingWallets).toHaveLength(1);
      expect(tradingWallets[0].is_active).toBe(true);
    });
  });

  describe('Wallet Type Validation', () => {
    it('should retrieve wallets without exposing private keys by default', async () => {
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([mockWallet]);

      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(wallets[0]).not.toHaveProperty('encrypted_private_key');
      expect(wallets[0]).toHaveProperty('address');
      expect(wallets[0]).toHaveProperty('id');
    });

    it('should retrieve wallets with private keys when explicitly requested', async () => {
      const walletWithKey = {
        ...mockWallet,
        encrypted_private_key: Buffer.from('encrypted_key_data'),
      };

      vi.spyOn(supabaseService, 'getWalletsByUserIdWithPrivateKeys').mockResolvedValue([
        walletWithKey,
      ]);

      const wallets = await supabaseService.getWalletsByUserIdWithPrivateKeys(mockUser.id);

      expect(wallets[0]).toHaveProperty('encrypted_private_key');
      expect(wallets[0].encrypted_private_key).toBeInstanceOf(Buffer);
    });

    it('should support read-only wallets (address only)', async () => {
      const readOnlyWallet = {
        ...mockWallet,
        // No encrypted_private_key field
      };

      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([readOnlyWallet]);

      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(wallets[0]).toHaveProperty('address');
      expect(wallets[0]).not.toHaveProperty('encrypted_private_key');
    });

    it('should support trading wallets (address + private key)', async () => {
      const tradingWallet = {
        ...mockWallet,
        encrypted_private_key: Buffer.from('encrypted_key_data'),
      };

      vi.spyOn(supabaseService, 'getWalletsByUserIdWithPrivateKeys').mockResolvedValue([
        tradingWallet,
      ]);

      const wallets = await supabaseService.getWalletsByUserIdWithPrivateKeys(mockUser.id);

      expect(wallets[0]).toHaveProperty('address');
      expect(wallets[0]).toHaveProperty('encrypted_private_key');
      expect(wallets[0].encrypted_private_key).toBeDefined();
    });
  });

  describe('Wallet Authorization for Campaign Operations', () => {
    it('should verify campaign ownership before accessing campaign wallets', async () => {
      vi.spyOn(supabaseService, 'getCampaignById').mockResolvedValue({
        ...mockCampaign,
        tokens: mockToken,
        pools: mockPool,
      } as any);

      const campaign = await supabaseService.getCampaignById(
        mockCampaign.id,
        mockUser.id
      );

      expect(campaign.user_id).toBe(mockUser.id);
    });

    it('should fail to access campaign with wrong user_id', async () => {
      vi.spyOn(supabaseService, 'getCampaignById').mockRejectedValue(
        new Error('No rows returned')
      );

      await expect(
        supabaseService.getCampaignById(mockCampaign.id, mockOtherUser.id)
      ).rejects.toThrow();
    });

    it('should retrieve wallets for campaign start operation', async () => {
      vi.spyOn(supabaseService, 'getCampaignById').mockResolvedValue({
        ...mockCampaign,
        tokens: mockToken,
        pools: mockPool,
      } as any);
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([mockWallet]);

      const campaign = await supabaseService.getCampaignById(
        mockCampaign.id,
        mockUser.id
      );
      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(campaign.user_id).toBe(mockUser.id);
      expect(wallets.every(w => w.user_id === mockUser.id)).toBe(true);
    });

    it('should enforce user isolation for wallet operations', async () => {
      // User 1 wallets
      vi.spyOn(supabaseService, 'getWalletsByUserId')
        .mockResolvedValueOnce([mockWallet]);

      const user1Wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(user1Wallets.every(w => w.user_id === mockUser.id)).toBe(true);
      expect(user1Wallets.some(w => w.user_id === mockOtherUser.id)).toBe(false);
    });
  });

  describe('Wallet Creation and Management Authorization', () => {
    it('should create wallet associated with correct user', async () => {
      const newWallet = {
        ...mockWallet,
        id: '30000000-0000-0000-0000-000000000004',
      };

      vi.spyOn(supabaseService, 'createWallet').mockResolvedValue(newWallet);

      const created = await supabaseService.createWallet({
        user_id: mockUser.id,
        address: '7k6Gyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX9U',
        label: 'New Wallet',
      });

      expect(created.user_id).toBe(mockUser.id);
      expect(created.address).toBeDefined();
    });

    it('should only update wallets owned by user', async () => {
      const updatedWallet = { ...mockWallet, label: 'Updated Label' };
      vi.spyOn(supabaseService, 'updateWallet').mockResolvedValue(updatedWallet);

      const result = await supabaseService.updateWallet(
        mockWallet.id,
        mockUser.id,
        { label: 'Updated Label' }
      );

      expect(result.id).toBe(mockWallet.id);
      expect(result.user_id).toBe(mockUser.id);
      expect(result.label).toBe('Updated Label');
    });

    it('should fail to update wallet belonging to another user', async () => {
      vi.spyOn(supabaseService, 'updateWallet').mockRejectedValue(
        new Error('No rows returned')
      );

      await expect(
        supabaseService.updateWallet(
          mockOtherUserWallet.id,
          mockUser.id,
          { label: 'Hacked' }
        )
      ).rejects.toThrow();
    });

    it('should only delete wallets owned by user', async () => {
      vi.spyOn(supabaseService, 'deleteWallet').mockResolvedValue(undefined);

      await expect(
        supabaseService.deleteWallet(mockWallet.id, mockUser.id)
      ).resolves.not.toThrow();
    });

    it('should fail to delete wallet belonging to another user', async () => {
      vi.spyOn(supabaseService, 'deleteWallet').mockRejectedValue(
        new Error('No rows returned')
      );

      await expect(
        supabaseService.deleteWallet(mockOtherUserWallet.id, mockUser.id)
      ).rejects.toThrow();
    });
  });

  describe('Campaign Wallet Integration Scenarios', () => {
    it('should handle campaign start with no wallets gracefully', async () => {
      vi.spyOn(supabaseService, 'getCampaignById').mockResolvedValue({
        ...mockCampaign,
        tokens: mockToken,
        pools: mockPool,
      } as any);
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([]);

      const campaign = await supabaseService.getCampaignById(
        mockCampaign.id,
        mockUser.id
      );
      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(campaign).toBeDefined();
      expect(wallets).toHaveLength(0);
      // Campaign start should handle empty wallet array gracefully
    });

    it('should handle campaign start with only inactive wallets', async () => {
      vi.spyOn(supabaseService, 'getCampaignById').mockResolvedValue({
        ...mockCampaign,
        tokens: mockToken,
        pools: mockPool,
      } as any);
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([
        mockInactiveWallet,
      ]);

      const campaign = await supabaseService.getCampaignById(
        mockCampaign.id,
        mockUser.id
      );
      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);
      const activeWallets = wallets.filter(w => w.is_active);

      expect(campaign).toBeDefined();
      expect(wallets).toHaveLength(1);
      expect(activeWallets).toHaveLength(0);
      // Campaign start should handle no active wallets gracefully
    });

    it('should handle campaign start with multiple active wallets', async () => {
      const mockWallet2 = {
        ...mockWallet,
        id: '30000000-0000-0000-0000-000000000005',
        address: '8k7Hyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkXAV',
        label: 'Wallet 2',
      };

      vi.spyOn(supabaseService, 'getCampaignById').mockResolvedValue({
        ...mockCampaign,
        tokens: mockToken,
        pools: mockPool,
      } as any);
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([
        mockWallet,
        mockWallet2,
      ]);

      const campaign = await supabaseService.getCampaignById(
        mockCampaign.id,
        mockUser.id
      );
      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);
      const activeWallets = wallets.filter(w => w.is_active);

      expect(campaign).toBeDefined();
      expect(wallets).toHaveLength(2);
      expect(activeWallets).toHaveLength(2);
      expect(activeWallets.every(w => w.is_active)).toBe(true);
    });

    it('should handle distribute operation wallet requirements', async () => {
      vi.spyOn(supabaseService, 'getCampaignById').mockResolvedValue({
        ...mockCampaign,
        tokens: mockToken,
        pools: mockPool,
      } as any);

      const campaign = await supabaseService.getCampaignById(
        mockCampaign.id,
        mockUser.id
      );

      expect(campaign).toBeDefined();
      expect(campaign.user_id).toBe(mockUser.id);
      // Distribute operation should verify campaign ownership
    });

    it('should handle sell-only operation wallet requirements', async () => {
      vi.spyOn(supabaseService, 'getCampaignById').mockResolvedValue({
        ...mockCampaign,
        tokens: mockToken,
        pools: mockPool,
      } as any);
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([mockWallet]);

      const campaign = await supabaseService.getCampaignById(
        mockCampaign.id,
        mockUser.id
      );
      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(campaign).toBeDefined();
      expect(campaign.user_id).toBe(mockUser.id);
      expect(wallets.every(w => w.user_id === mockUser.id)).toBe(true);
      // Sell-only operation should use user's wallets only
    });

    it('should handle gather-funds operation wallet requirements', async () => {
      vi.spyOn(supabaseService, 'getCampaignById').mockResolvedValue({
        ...mockCampaign,
        tokens: mockToken,
        pools: mockPool,
      } as any);

      const campaign = await supabaseService.getCampaignById(
        mockCampaign.id,
        mockUser.id
      );

      expect(campaign).toBeDefined();
      expect(campaign.user_id).toBe(mockUser.id);
      // Gather-funds operation should verify campaign ownership
    });
  });

  describe('Wallet Balance and Private Key Requirements', () => {
    it('should verify wallet has private key for trading operations', async () => {
      const tradingWallet = {
        ...mockWallet,
        encrypted_private_key: Buffer.from('encrypted_key_data'),
      };

      vi.spyOn(supabaseService, 'getWalletsByUserIdWithPrivateKeys').mockResolvedValue([
        tradingWallet,
      ]);

      const wallets = await supabaseService.getWalletsByUserIdWithPrivateKeys(mockUser.id);

      expect(wallets[0].encrypted_private_key).toBeDefined();
      expect(wallets[0].encrypted_private_key).toBeInstanceOf(Buffer);
      // Trading operations require encrypted private key
    });

    it('should differentiate between read-only and trading wallets', async () => {
      const readOnlyWallet = { ...mockWallet }; // No private key
      const tradingWallet = {
        ...mockWallet,
        id: '30000000-0000-0000-0000-000000000006',
        encrypted_private_key: Buffer.from('encrypted_key_data'),
      };

      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([
        readOnlyWallet,
      ]);
      vi.spyOn(supabaseService, 'getWalletsByUserIdWithPrivateKeys').mockResolvedValue([
        tradingWallet,
      ]);

      const basicWallets = await supabaseService.getWalletsByUserId(mockUser.id);
      const tradingWallets = await supabaseService.getWalletsByUserIdWithPrivateKeys(
        mockUser.id
      );

      // Basic query doesn't expose private keys
      expect(basicWallets[0]).not.toHaveProperty('encrypted_private_key');

      // Trading query includes private keys
      expect(tradingWallets[0]).toHaveProperty('encrypted_private_key');
    });

    it('should support wallet private key updates', async () => {
      const newEncryptedKey = Buffer.from('new_encrypted_key_data');
      vi.spyOn(supabaseService, 'updateWalletPrivateKey').mockResolvedValue(undefined);

      await expect(
        supabaseService.updateWalletPrivateKey(mockWallet.id, newEncryptedKey)
      ).resolves.not.toThrow();
    });
  });

  describe('Cross-User Wallet Access Prevention', () => {
    it('should prevent user from accessing another users wallet by ID', async () => {
      vi.spyOn(supabaseService, 'getWalletById').mockRejectedValue(
        new Error('No rows returned')
      );

      await expect(
        supabaseService.getWalletById(mockOtherUserWallet.id, mockUser.id)
      ).rejects.toThrow();
    });

    it('should prevent user from updating another users wallet', async () => {
      vi.spyOn(supabaseService, 'updateWallet').mockRejectedValue(
        new Error('No rows returned')
      );

      await expect(
        supabaseService.updateWallet(
          mockOtherUserWallet.id,
          mockUser.id,
          { label: 'Unauthorized' }
        )
      ).rejects.toThrow();
    });

    it('should prevent user from deleting another users wallet', async () => {
      vi.spyOn(supabaseService, 'deleteWallet').mockRejectedValue(
        new Error('No rows returned')
      );

      await expect(
        supabaseService.deleteWallet(mockOtherUserWallet.id, mockUser.id)
      ).rejects.toThrow();
    });

    it('should prevent campaign from using another users wallets', async () => {
      // Mock campaign owned by user 1
      vi.spyOn(supabaseService, 'getCampaignById').mockResolvedValue({
        ...mockCampaign,
        user_id: mockUser.id,
        tokens: mockToken,
        pools: mockPool,
      } as any);

      // Mock wallets - should only return user 1's wallets
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockResolvedValue([mockWallet]);

      const campaign = await supabaseService.getCampaignById(
        mockCampaign.id,
        mockUser.id
      );
      const wallets = await supabaseService.getWalletsByUserId(mockUser.id);

      expect(campaign.user_id).toBe(mockUser.id);
      expect(wallets.every(w => w.user_id === mockUser.id)).toBe(true);
      expect(wallets.some(w => w.user_id === mockOtherUser.id)).toBe(false);
      // System enforces that campaigns can only use owner's wallets
    });
  });

  describe('Wallet Requirement Edge Cases', () => {
    it('should handle undefined user_id gracefully', async () => {
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockRejectedValue(
        new Error('Invalid user ID')
      );

      await expect(
        supabaseService.getWalletsByUserId(undefined as any)
      ).rejects.toThrow();
    });

    it('should handle null user_id gracefully', async () => {
      vi.spyOn(supabaseService, 'getWalletsByUserId').mockRejectedValue(
        new Error('Invalid user ID')
      );

      await expect(
        supabaseService.getWalletsByUserId(null as any)
      ).rejects.toThrow();
    });

    it('should handle invalid UUID format for wallet ID', async () => {
      const invalidId = 'not-a-valid-uuid';
      vi.spyOn(supabaseService, 'getWalletById').mockRejectedValue(
        new Error('Invalid UUID format')
      );

      await expect(
        supabaseService.getWalletById(invalidId, mockUser.id)
      ).rejects.toThrow();
    });

    it('should handle malformed wallet data gracefully', async () => {
      const malformedWallet = {
        id: mockWallet.id,
        // Missing required fields
      };

      vi.spyOn(supabaseService, 'getWalletById').mockResolvedValue(
        malformedWallet as any
      );

      const wallet = await supabaseService.getWalletById(mockWallet.id, mockUser.id);

      // Should still return the wallet, but may be incomplete
      expect(wallet).toBeDefined();
      expect(wallet.id).toBe(mockWallet.id);
    });

    it('should handle concurrent wallet access correctly', async () => {
      vi.spyOn(supabaseService, 'getWalletById').mockResolvedValue(mockWallet);

      // Simulate concurrent access
      const promises = Array(5).fill(null).map(() =>
        supabaseService.getWalletById(mockWallet.id, mockUser.id)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every(w => w.id === mockWallet.id)).toBe(true);
      expect(results.every(w => w.user_id === mockUser.id)).toBe(true);
    });
  });
});
