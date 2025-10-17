import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from './supabase.service';
import { createClient } from '@supabase/supabase-js';

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('SupabaseService', () => {
  let service: SupabaseService;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock Supabase client with chainable methods
    const createMockQuery = (returnValue: any = { data: null, error: null }) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(returnValue),
      // Default resolve for non-single queries
      then: vi.fn((resolve) => resolve(returnValue)),
    });

    mockSupabaseClient = {
      from: vi.fn(() => createMockQuery()),
    };

    // Mock createClient to return our mock client
    (createClient as any).mockReturnValue(mockSupabaseClient);

    // Set environment variables
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [SupabaseService],
    }).compile();

    service = module.get<SupabaseService>(SupabaseService);
  });

  describe('Client Initialization', () => {
    it('should create Supabase client on initialization', () => {
      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );
    });

    it('should provide access to Supabase client', () => {
      const client = service.getClient();
      expect(client).toBeDefined();
      expect(client).toBe(mockSupabaseClient);
    });
  });

  describe('Token Operations', () => {
    it('should get all tokens', async () => {
      const mockTokens = [
        { id: '1', mint: 'mint1', symbol: 'TOKEN1', decimals: 9 },
        { id: '2', mint: 'mint2', symbol: 'TOKEN2', decimals: 6 },
      ];

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockTokens, error: null }),
      }));

      const result = await service.getTokens();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('tokens');
      expect(result).toEqual(mockTokens);
    });

    it('should get token by ID', async () => {
      const mockToken = { id: '1', mint: 'mint1', symbol: 'TOKEN1', decimals: 9 };

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockToken, error: null }),
      }));

      const result = await service.getTokenById('1');

      expect(result).toEqual(mockToken);
    });

    it('should get token by mint address', async () => {
      const mockToken = { id: '1', mint: 'mint1', symbol: 'TOKEN1', decimals: 9 };

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockToken, error: null }),
      }));

      const result = await service.getTokenByMint('mint1');

      expect(result).toEqual(mockToken);
    });

    it('should create a token', async () => {
      const tokenData = { mint: 'mint1', symbol: 'TOKEN1', decimals: 9 };
      const mockCreatedToken = { id: '1', ...tokenData };

      mockSupabaseClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCreatedToken, error: null }),
      }));

      const result = await service.createToken(tokenData);

      expect(result).toEqual(mockCreatedToken);
    });

    it('should throw error when token creation fails', async () => {
      const tokenData = { mint: 'mint1', symbol: 'TOKEN1', decimals: 9 };
      const mockError = new Error('Duplicate mint address');

      mockSupabaseClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      }));

      await expect(service.createToken(tokenData)).rejects.toThrow('Duplicate mint address');
    });
  });

  describe('Wallet Operations', () => {
    it('should get wallets by user ID', async () => {
      const mockWallets = [
        { id: '1', user_id: 'user1', address: 'addr1', label: 'Wallet 1' },
        { id: '2', user_id: 'user1', address: 'addr2', label: 'Wallet 2' },
      ];

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockWallets, error: null }),
      }));

      const result = await service.getWalletsByUserId('user1');

      expect(result).toEqual(mockWallets);
    });

    it('should get wallet by ID and user ID', async () => {
      const mockWallet = { id: '1', user_id: 'user1', address: 'addr1', label: 'Wallet 1' };

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockWallet, error: null }),
      }));

      const result = await service.getWalletById('1', 'user1');

      expect(result).toEqual(mockWallet);
    });

    it('should create a wallet', async () => {
      const walletData = {
        user_id: 'user1',
        address: 'addr1',
        label: 'My Wallet',
      };
      const mockCreatedWallet = { id: '1', ...walletData };

      mockSupabaseClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCreatedWallet, error: null }),
      }));

      const result = await service.createWallet(walletData);

      expect(result).toEqual(mockCreatedWallet);
    });

    it('should update a wallet', async () => {
      const updates = { label: 'Updated Wallet' };
      const mockUpdatedWallet = { id: '1', user_id: 'user1', label: 'Updated Wallet' };

      mockSupabaseClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockUpdatedWallet, error: null }),
      }));

      const result = await service.updateWallet('1', 'user1', updates);

      expect(result).toEqual(mockUpdatedWallet);
    });

    it('should delete a wallet', async () => {
      mockSupabaseClient.from = vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ error: null })),
      }));

      await expect(service.deleteWallet('1', 'user1')).resolves.not.toThrow();
    });
  });

  describe('Campaign Operations', () => {
    it('should get campaigns by user ID with relations', async () => {
      const mockCampaigns = [
        {
          id: '1',
          user_id: 'user1',
          name: 'Campaign 1',
          tokens: { mint: 'mint1', symbol: 'TOKEN1' },
          pools: { pool_address: 'pool1', dex: 'raydium' },
        },
      ];

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockCampaigns, error: null }),
      }));

      const result = await service.getCampaignsByUserId('user1');

      expect(result).toEqual(mockCampaigns);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('campaigns');
    });

    it('should get campaign by ID with relations', async () => {
      const mockCampaign = {
        id: '1',
        user_id: 'user1',
        name: 'Campaign 1',
        tokens: { mint: 'mint1', symbol: 'TOKEN1' },
        pools: { pool_address: 'pool1', dex: 'raydium' },
      };

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCampaign, error: null }),
      }));

      const result = await service.getCampaignById('1', 'user1');

      expect(result).toEqual(mockCampaign);
    });

    it('should create a campaign', async () => {
      const campaignData = {
        user_id: 'user1',
        name: 'New Campaign',
        token_id: 'token1',
        pool_id: 'pool1',
        params: { trades: 100 },
      };
      const mockCreatedCampaign = { id: '1', ...campaignData };

      mockSupabaseClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCreatedCampaign, error: null }),
      }));

      const result = await service.createCampaign(campaignData);

      expect(result).toEqual(mockCreatedCampaign);
    });

    it('should update a campaign', async () => {
      const updates = { name: 'Updated Campaign', status: 'paused' };
      const mockUpdatedCampaign = { id: '1', user_id: 'user1', ...updates };

      mockSupabaseClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockUpdatedCampaign, error: null }),
      }));

      const result = await service.updateCampaign('1', 'user1', updates);

      expect(result).toEqual(mockUpdatedCampaign);
    });
  });

  describe('User Encryption Key Operations', () => {
    it('should get user encryption key', async () => {
      const mockKey = {
        user_id: 'user1',
        encrypted_dek: Buffer.from('encrypted'),
        key_version: 1,
      };

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockKey, error: null }),
      }));

      const result = await service.getUserEncryptionKey('user1');

      expect(result).toEqual(mockKey);
    });

    it('should return null when no encryption key exists', async () => {
      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' }, // No rows error
        }),
      }));

      const result = await service.getUserEncryptionKey('user1');

      expect(result).toBeNull();
    });

    it('should create user encryption key', async () => {
      const keyData = {
        user_id: 'user1',
        encrypted_dek: Buffer.from('encrypted'),
        key_version: 1,
      };
      const mockCreatedKey = { id: '1', ...keyData };

      mockSupabaseClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCreatedKey, error: null }),
      }));

      const result = await service.createUserEncryptionKey(keyData);

      expect(result).toEqual(mockCreatedKey);
    });

    it('should get all user encryption keys', async () => {
      const mockKeys = [
        { user_id: 'user1', encrypted_dek: Buffer.from('key1'), key_version: 1 },
        { user_id: 'user2', encrypted_dek: Buffer.from('key2'), key_version: 1 },
      ];

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockKeys, error: null }),
      }));

      const result = await service.getAllUserEncryptionKeys();

      expect(result).toEqual(mockKeys);
    });

    it('should return empty array when no keys exist', async () => {
      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: null }),
      }));

      const result = await service.getAllUserEncryptionKeys();

      expect(result).toEqual([]);
    });
  });

  describe('User Settings Operations', () => {
    it('should get user settings', async () => {
      const mockSettings = {
        user_id: 'user1',
        trading_config: { slippage: 0.5 },
        jito_config: { tip: 0.001 },
      };

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockSettings, error: null }),
      }));

      const result = await service.getUserSettings('user1');

      expect(result).toEqual(mockSettings);
    });

    it('should return null when no settings exist', async () => {
      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      }));

      const result = await service.getUserSettings('user1');

      expect(result).toBeNull();
    });

    it('should upsert user settings when settings exist', async () => {
      const existingSettings = { user_id: 'user1', trading_config: { slippage: 0.5 } };
      const updates = { jito_config: { tip: 0.001 } };
      const mockUpdatedSettings = { ...existingSettings, ...updates };

      let callCount = 0;
      mockSupabaseClient.from = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First call - getUserSettings returns existing settings
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: existingSettings, error: null }),
          };
        }
        // Second call - update
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockUpdatedSettings, error: null }),
        };
      });

      const result = await service.upsertUserSettings('user1', updates);

      expect(result).toEqual(mockUpdatedSettings);
    });

    it('should insert user settings when settings do not exist', async () => {
      const settings = { trading_config: { slippage: 0.5 } };
      const mockInsertedSettings = { user_id: 'user1', ...settings };

      let callCount = 0;
      mockSupabaseClient.from = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First call - getUserSettings returns null
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          };
        }
        // Second call - insert
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockInsertedSettings, error: null }),
        };
      });

      const result = await service.upsertUserSettings('user1', settings);

      expect(result).toEqual(mockInsertedSettings);
    });
  });

  describe('Error Handling', () => {
    it('should throw database errors', async () => {
      const mockError = new Error('Database connection failed');

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      }));

      await expect(service.getTokens()).rejects.toThrow('Database connection failed');
    });

    it('should throw error on encryption key operations failure', async () => {
      const mockError = new Error('Encryption key error');

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      }));

      await expect(service.getUserEncryptionKey('user1')).rejects.toThrow(
        'Encryption key error'
      );
    });
  });
});
