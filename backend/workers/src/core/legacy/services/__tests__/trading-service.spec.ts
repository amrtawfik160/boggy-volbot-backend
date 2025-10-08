import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TradingService, TradingServiceConfig } from '../trading-service';
import * as swapUtils from '../../utils/swapOnlyAmm';

vi.mock('../../utils/swapOnlyAmm');
vi.mock('../../utils/logger', () => ({
  tradeLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../../utils/utils', () => ({
  globalRateLimiter: {
    waitForSlot: vi.fn(),
  },
}));

describe('TradingService - Executor Selection', () => {
  let connection: Connection;
  let wallet: Keypair;
  let baseMint: PublicKey;
  let poolId: PublicKey;
  let mockTransaction: VersionedTransaction;

  beforeEach(() => {
    connection = new Connection('https://api.mainnet-beta.solana.com');
    wallet = Keypair.generate();
    baseMint = Keypair.generate().publicKey;
    poolId = Keypair.generate().publicKey;
    mockTransaction = {} as VersionedTransaction;

    vi.clearAllMocks();
  });

  describe('Legacy Executor Selection', () => {
    it('should use legacy executor when useJito is false', async () => {
      const config: TradingServiceConfig = {
        connection,
        rpcEndpoint: 'https://api.mainnet-beta.solana.com',
        rpcWebsocketEndpoint: 'wss://api.mainnet-beta.solana.com',
      };

      const tradingService = new TradingService(config);

      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockResolvedValue(mockTransaction);

      // Mock the executor's execute method
      const mockExecute = vi.fn().mockResolvedValue({
        success: true,
        signature: 'mock-signature-legacy',
      });

      // Mock ExecutorFactory.fromEnvironment to return our mocked executor
      vi.mock('../../executor/factory', () => ({
        ExecutorFactory: {
          fromEnvironment: vi.fn(() => ({
            execute: mockExecute,
            getType: () => 'legacy',
          })),
        },
      }));

      await tradingService.executeBuy(wallet, baseMint, 0.01, poolId, false);

      // Verify legacy executor was created and used
      expect(mockExecute).toHaveBeenCalledWith(
        mockTransaction,
        wallet,
        expect.objectContaining({ isBuy: true })
      );
    });
  });

  describe('Jito Executor Selection', () => {
    it('should use Jito executor when useJito is true and config is provided', async () => {
      const jitoAuthKeypair = Keypair.generate();
      const config: TradingServiceConfig = {
        connection,
        rpcEndpoint: 'https://api.mainnet-beta.solana.com',
        rpcWebsocketEndpoint: 'wss://api.mainnet-beta.solana.com',
        jitoConfig: {
          blockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
          authKeypair: jitoAuthKeypair,
          tipAmount: 0.0001,
          bundleTransactionLimit: 4,
          bundleTimeoutMs: 30000,
        },
      };

      const tradingService = new TradingService(config);

      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockResolvedValue(mockTransaction);

      const mockExecute = vi.fn().mockResolvedValue({
        success: true,
        signature: 'bundled',
      });

      vi.mock('../../executor/factory', () => ({
        ExecutorFactory: {
          fromEnvironment: vi.fn(() => ({
            execute: mockExecute,
            getType: () => 'jito',
          })),
        },
      }));

      await tradingService.executeBuy(wallet, baseMint, 0.01, poolId, true);

      expect(mockExecute).toHaveBeenCalledWith(
        mockTransaction,
        wallet,
        expect.objectContaining({ isBuy: true })
      );
    });

    it('should throw error when Jito is enabled but config is missing', async () => {
      const config: TradingServiceConfig = {
        connection,
        rpcEndpoint: 'https://api.mainnet-beta.solana.com',
        rpcWebsocketEndpoint: 'wss://api.mainnet-beta.solana.com',
        // No jitoConfig provided
      };

      const tradingService = new TradingService(config);

      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockResolvedValue(mockTransaction);

      // This should fail during executor creation
      await expect(
        tradingService.executeBuy(wallet, baseMint, 0.01, poolId, true)
      ).rejects.toThrow();
    });
  });

  describe('Executor Selection in Sell Operations', () => {
    it('should select correct executor for sell based on useJito flag', async () => {
      const config: TradingServiceConfig = {
        connection,
        rpcEndpoint: 'https://api.mainnet-beta.solana.com',
        rpcWebsocketEndpoint: 'wss://api.mainnet-beta.solana.com',
      };

      const tradingService = new TradingService(config);

      vi.spyOn(swapUtils, 'getSellTxWithJupiter').mockResolvedValue(mockTransaction);

      // Mock getTokenBalance to return a balance
      const mockGetTokenBalance = vi.fn().mockResolvedValue('1000000');
      (tradingService as any).getTokenBalance = mockGetTokenBalance;

      const mockExecute = vi.fn().mockResolvedValue({
        success: true,
        signature: 'mock-sell-signature',
      });

      vi.mock('../../executor/factory', () => ({
        ExecutorFactory: {
          fromEnvironment: vi.fn(() => ({
            execute: mockExecute,
            getType: () => 'legacy',
          })),
        },
      }));

      await tradingService.executeSell(wallet, baseMint, poolId, false);

      expect(mockExecute).toHaveBeenCalledWith(
        mockTransaction,
        wallet,
        expect.objectContaining({ isBuy: false })
      );
    });
  });
});
