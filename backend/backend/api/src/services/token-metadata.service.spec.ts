import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenMetadata } from './token-metadata.service';

// Mock the external dependencies
vi.mock('@metaplex-foundation/mpl-token-metadata', () => ({
  Metadata: {
    deserialize: vi.fn(),
  },
}));

describe('TokenMetadataService', () => {
  let mockConnection: Connection;
  const TEST_MINT_ADDRESS = 'So11111111111111111111111111111111111111112'; // SOL mint

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock connection
    mockConnection = {
      getParsedAccountInfo: vi.fn(),
      getAccountInfo: vi.fn(),
    } as any;
  });

  describe('getTokenMetadata', () => {
    it('should fetch token metadata successfully with Metaplex data', async () => {
      const mintAddress = new PublicKey(TEST_MINT_ADDRESS);

      // Mock mint info response
      mockConnection.getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: {
                decimals: 9,
              },
            },
          },
        },
      });

      // Mock metadata account response
      const mockMetadata = {
        data: {
          symbol: 'TEST',
          name: 'Test Token',
          uri: 'https://example.com/metadata.json',
        },
      };

      mockConnection.getAccountInfo = vi.fn().mockResolvedValue({
        data: Buffer.from('mock-data'),
      });

      // Mock Metadata.deserialize
      const { Metadata } = await import('@metaplex-foundation/mpl-token-metadata');
      (Metadata.deserialize as any).mockReturnValue([mockMetadata]);

      // Mock fetch for off-chain metadata
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          image: 'https://example.com/image.png',
        }),
      } as any);

      const result = await getTokenMetadata(mockConnection, mintAddress);

      expect(result).toEqual({
        symbol: 'TEST',
        decimals: 9,
        name: 'Test Token',
        image: 'https://example.com/image.png',
      });

      expect(mockConnection.getParsedAccountInfo).toHaveBeenCalledWith(mintAddress);
      expect(mockConnection.getAccountInfo).toHaveBeenCalled();
    });

    it('should handle missing Metaplex metadata gracefully', async () => {
      const mintAddress = new PublicKey(TEST_MINT_ADDRESS);

      // Mock mint info response
      mockConnection.getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: {
                decimals: 6,
              },
            },
          },
        },
      });

      // Mock no metadata account
      mockConnection.getAccountInfo = vi.fn().mockResolvedValue(null);

      const result = await getTokenMetadata(mockConnection, mintAddress);

      expect(result).toEqual({
        symbol: 'UNKNOWN', // Default when metadata parsing fails
        decimals: 6,
        name: '',
        image: '',
      });
    });

    it('should use default decimals (9) when mint info is missing decimals', async () => {
      const mintAddress = new PublicKey(TEST_MINT_ADDRESS);

      // Mock mint info response without decimals
      mockConnection.getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: {},
            },
          },
        },
      });

      mockConnection.getAccountInfo = vi.fn().mockResolvedValue(null);

      const result = await getTokenMetadata(mockConnection, mintAddress);

      expect(result.decimals).toBe(9);
    });

    it('should handle off-chain metadata fetch errors gracefully', async () => {
      const mintAddress = new PublicKey(TEST_MINT_ADDRESS);

      mockConnection.getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: {
                decimals: 9,
              },
            },
          },
        },
      });

      const mockMetadata = {
        data: {
          symbol: 'TEST',
          name: 'Test Token',
          uri: 'https://example.com/metadata.json',
        },
      };

      mockConnection.getAccountInfo = vi.fn().mockResolvedValue({
        data: Buffer.from('mock-data'),
      });

      const { Metadata } = await import('@metaplex-foundation/mpl-token-metadata');
      (Metadata.deserialize as any).mockReturnValue([mockMetadata]);

      // Mock fetch to throw error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await getTokenMetadata(mockConnection, mintAddress);

      expect(result).toEqual({
        symbol: 'TEST',
        decimals: 9,
        name: 'Test Token',
        image: '', // Empty image due to fetch error
      });
    });

    it('should strip null characters from symbol and name', async () => {
      const mintAddress = new PublicKey(TEST_MINT_ADDRESS);

      mockConnection.getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: {
                decimals: 9,
              },
            },
          },
        },
      });

      const mockMetadata = {
        data: {
          symbol: 'TEST\0\0\0',
          name: 'Test Token\0',
          uri: 'https://example.com/metadata.json\0',
        },
      };

      mockConnection.getAccountInfo = vi.fn().mockResolvedValue({
        data: Buffer.from('mock-data'),
      });

      const { Metadata } = await import('@metaplex-foundation/mpl-token-metadata');
      (Metadata.deserialize as any).mockReturnValue([mockMetadata]);

      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          image: 'https://example.com/image.png',
        }),
      } as any);

      const result = await getTokenMetadata(mockConnection, mintAddress);

      expect(result.symbol).toBe('TEST');
      expect(result.name).toBe('Test Token');
    });

    it('should throw error when token mint is not found', async () => {
      const mintAddress = new PublicKey(TEST_MINT_ADDRESS);

      // Mock mint info response with null value
      mockConnection.getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: null,
      });

      await expect(getTokenMetadata(mockConnection, mintAddress)).rejects.toThrow(
        'Failed to fetch token metadata: Token mint not found'
      );
    });

    it('should throw error when connection fails', async () => {
      const mintAddress = new PublicKey(TEST_MINT_ADDRESS);

      // Mock connection error
      mockConnection.getParsedAccountInfo = vi.fn().mockRejectedValue(
        new Error('Connection timeout')
      );

      await expect(getTokenMetadata(mockConnection, mintAddress)).rejects.toThrow(
        'Failed to fetch token metadata: Connection timeout'
      );
    });

    it('should return UNKNOWN symbol when no metadata and symbol generation fails', async () => {
      const mintAddress = new PublicKey(TEST_MINT_ADDRESS);

      mockConnection.getParsedAccountInfo = vi.fn().mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: {
                decimals: 9,
              },
            },
          },
        },
      });

      mockConnection.getAccountInfo = vi.fn().mockRejectedValue(
        new Error('Metadata not found')
      );

      const result = await getTokenMetadata(mockConnection, mintAddress);

      expect(result.symbol).toBeTruthy(); // Should have a fallback symbol
    });
  });
});
