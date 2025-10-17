import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import { TokensController } from '../tokens.controller';
import { SupabaseService } from '../../../services/supabase.service';
import { getTokenMetadata } from '../../../services/token-metadata.service';

// Mock the token-metadata service
vi.mock('../../../services/token-metadata.service', () => ({
  getTokenMetadata: vi.fn(),
}));

describe('TokensController Integration Tests', () => {
  let controller: TokensController;
  let supabaseService: SupabaseService;

  const mockUser = { id: 'test-user-123' };

  const mockSupabaseService = {
    getTokens: vi.fn(),
    getTokenById: vi.fn(),
    getTokenByMint: vi.fn(),
    createToken: vi.fn(),
    getPoolsByTokenId: vi.fn(),
    createPool: vi.fn(),
    updateToken: vi.fn(),
    deleteToken: vi.fn(),
  };

  beforeEach(async () => {
    // Manually instantiate controller with mocked dependencies
    controller = new TokensController(mockSupabaseService as any);
    supabaseService = mockSupabaseService as any;

    vi.clearAllMocks();
  });

  describe('listTokens', () => {
    it('should return all tokens', async () => {
      const mockTokens = [
        { id: 't1', mint: 'mint1', name: 'Token 1', symbol: 'TK1' },
        { id: 't2', mint: 'mint2', name: 'Token 2', symbol: 'TK2' },
      ];

      mockSupabaseService.getTokens.mockResolvedValue(mockTokens);

      const result = await controller.listTokens();

      expect(result).toEqual(mockTokens);
      expect(mockSupabaseService.getTokens).toHaveBeenCalled();
    });

    it('should return empty array when no tokens exist', async () => {
      mockSupabaseService.getTokens.mockResolvedValue([]);

      const result = await controller.listTokens();

      expect(result).toEqual([]);
    });
  });

  describe('getToken', () => {
    it('should return a specific token by id', async () => {
      const mockToken = { id: 't1', mint: 'mint1', name: 'Token 1' };

      mockSupabaseService.getTokenById.mockResolvedValue(mockToken);

      const result = await controller.getToken('t1');

      expect(result).toEqual(mockToken);
      expect(mockSupabaseService.getTokenById).toHaveBeenCalledWith('t1');
    });
  });

  describe('createToken', () => {
    it('should return existing token if it already exists', async () => {
      const dto = {
        mint: 'existing-mint',
        name: 'Existing Token',
        symbol: 'EXT',
      };

      const existingToken = { id: 't1', ...dto };

      mockSupabaseService.getTokenByMint.mockResolvedValue(existingToken);

      const result = await controller.createToken(dto, mockUser);

      expect(result).toEqual(existingToken);
      expect(mockSupabaseService.createToken).not.toHaveBeenCalled();
    });

    it('should create new token if it does not exist', async () => {
      const dto = {
        mint: 'new-mint',
        name: 'New Token',
        symbol: 'NEW',
      };

      const createdToken = { id: 't2', ...dto };

      mockSupabaseService.getTokenByMint.mockRejectedValue(new Error('Not found'));
      mockSupabaseService.createToken.mockResolvedValue(createdToken);

      const result = await controller.createToken(dto, mockUser);

      expect(result).toEqual(createdToken);
      expect(mockSupabaseService.createToken).toHaveBeenCalledWith(dto);
    });
  });

  describe('listPools', () => {
    it('should return all pools for a token', async () => {
      const mockPools = [
        { id: 'p1', token_id: 't1', pool_address: 'pool1', dex: 'raydium' },
        { id: 'p2', token_id: 't1', pool_address: 'pool2', dex: 'orca' },
      ];

      mockSupabaseService.getPoolsByTokenId.mockResolvedValue(mockPools);

      const result = await controller.listPools('t1');

      expect(result).toEqual(mockPools);
      expect(mockSupabaseService.getPoolsByTokenId).toHaveBeenCalledWith('t1');
    });
  });

  describe('createPool', () => {
    it('should create a new pool for a token', async () => {
      const dto = {
        pool_address: 'pool-addr-123',
        dex: 'raydium',
        metadata: { fee: 0.003 },
      };

      const createdPool = {
        id: 'p1',
        token_id: 't1',
        ...dto,
      };

      mockSupabaseService.createPool.mockResolvedValue(createdPool);

      const result = await controller.createPool('t1', dto, mockUser);

      expect(result).toEqual(createdPool);
      expect(mockSupabaseService.createPool).toHaveBeenCalledWith({
        token_id: 't1',
        pool_address: dto.pool_address,
        dex: dto.dex,
        metadata: dto.metadata,
      });
    });
  });

  describe('fetchMetadata', () => {
    it('should fetch token metadata from blockchain', async () => {
      const mint = 'So11111111111111111111111111111111111111112';
      const mockMetadata = {
        name: 'Wrapped SOL',
        symbol: 'SOL',
        decimals: 9,
        uri: 'https://example.com/metadata.json',
      };

      (getTokenMetadata as any).mockResolvedValue(mockMetadata);

      const result = await controller.fetchMetadata(mint);

      expect(result).toEqual(mockMetadata);
      expect(getTokenMetadata).toHaveBeenCalledWith(expect.anything(), expect.anything());
    });

    it('should throw HttpException when metadata fetch fails', async () => {
      const mint = 'invalid-mint';

      (getTokenMetadata as any).mockRejectedValue(new Error('Invalid public key'));

      await expect(controller.fetchMetadata(mint)).rejects.toThrow(HttpException);
    });
  });

  describe('updateToken', () => {
    it('should update token with new data', async () => {
      const dto = {
        name: 'Updated Token',
        symbol: 'UPD',
      };

      const updatedToken = {
        id: 't1',
        mint: 'mint1',
        ...dto,
      };

      mockSupabaseService.updateToken.mockResolvedValue(updatedToken);

      const result = await controller.updateToken('t1', dto, mockUser);

      expect(result).toEqual(updatedToken);
      expect(mockSupabaseService.updateToken).toHaveBeenCalledWith('t1', dto);
    });
  });

  describe('deleteToken', () => {
    it('should delete a token', async () => {
      mockSupabaseService.deleteToken.mockResolvedValue(undefined);

      await controller.deleteToken('t1', mockUser);

      expect(mockSupabaseService.deleteToken).toHaveBeenCalledWith('t1');
    });
  });
});
