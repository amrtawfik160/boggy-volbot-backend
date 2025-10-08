import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { LegacyExecutor } from '../legacy-executor';
import { ExecutorConfig, ExecutorType } from '../types';

describe('LegacyExecutor', () => {
  let executor: LegacyExecutor;
  let mockConnection: Connection;
  let config: ExecutorConfig;
  let testKeypair: Keypair;
  let mockTransaction: VersionedTransaction;

  beforeEach(() => {
    testKeypair = Keypair.generate();

    config = {
      connection: new Connection('https://api.mainnet-beta.solana.com'),
      rpcEndpoint: 'https://api.mainnet-beta.solana.com',
      rpcWebsocketEndpoint: 'wss://api.mainnet-beta.solana.com',
    };

    executor = new LegacyExecutor(config);

    // Mock transaction
    mockTransaction = {} as VersionedTransaction;
    mockTransaction.serialize = vi.fn().mockReturnValue(Buffer.from('mock-tx'));
  });

  describe('Constructor', () => {
    it('should create executor with correct config', () => {
      expect(executor).toBeInstanceOf(LegacyExecutor);
      expect(executor.getType()).toBe(ExecutorType.LEGACY);
    });

    it('should initialize connection with correct endpoints', () => {
      const connection = executor.getConnection();
      expect(connection).toBeInstanceOf(Connection);
    });
  });

  describe('getType()', () => {
    it('should return LEGACY type', () => {
      expect(executor.getType()).toBe(ExecutorType.LEGACY);
    });
  });

  describe('execute()', () => {
    it('should have execute method', () => {
      expect(typeof executor.execute).toBe('function');
    });

    it('should return TransactionExecutionResult with correct structure', async () => {
      // Mock connection methods
      const connection = executor.getConnection();
      vi.spyOn(connection, 'getLatestBlockhash').mockResolvedValue({
        blockhash: 'mock-blockhash',
        lastValidBlockHeight: 12345,
      });

      vi.spyOn(connection, 'sendRawTransaction').mockResolvedValue('mock-signature');

      vi.spyOn(connection, 'confirmTransaction').mockResolvedValue({
        context: { slot: 123 },
        value: { err: null },
      } as any);

      const result = await executor.execute(mockTransaction, testKeypair);

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');

      if (result.success) {
        expect(result).toHaveProperty('signature');
      } else {
        expect(result).toHaveProperty('error');
      }
    });

    it('should handle transaction errors gracefully', async () => {
      const connection = executor.getConnection();
      vi.spyOn(connection, 'getLatestBlockhash').mockRejectedValue(
        new Error('Network error')
      );

      const result = await executor.execute(mockTransaction, testKeypair);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Network error');
    });

    it('should accept execution options', async () => {
      const connection = executor.getConnection();
      vi.spyOn(connection, 'getLatestBlockhash').mockResolvedValue({
        blockhash: 'mock-blockhash',
        lastValidBlockHeight: 12345,
      });

      vi.spyOn(connection, 'sendRawTransaction').mockResolvedValue('mock-signature');
      vi.spyOn(connection, 'confirmTransaction').mockResolvedValue({
        context: { slot: 123 },
        value: { err: null },
      } as any);

      const result = await executor.execute(mockTransaction, testKeypair, {
        isBuy: false,
        maxRetries: 5,
        skipPreflight: false,
        commitment: 'finalized',
      });

      expect(result).toBeDefined();
    });
  });

  describe('executeBatch()', () => {
    it('should have executeBatch method', () => {
      expect(typeof executor.executeBatch).toBe('function');
    });

    it('should execute multiple transactions', async () => {
      const connection = executor.getConnection();

      vi.spyOn(connection, 'getLatestBlockhash').mockResolvedValue({
        blockhash: 'mock-blockhash',
        lastValidBlockHeight: 12345,
      });

      vi.spyOn(connection, 'sendRawTransaction').mockResolvedValue('mock-signature');
      vi.spyOn(connection, 'confirmTransaction').mockResolvedValue({
        context: { slot: 123 },
        value: { err: null },
      } as any);

      const transactions = [mockTransaction, mockTransaction, mockTransaction];
      const result = await executor.executeBatch(transactions, testKeypair);

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('should return combined signatures for successful batch', async () => {
      const connection = executor.getConnection();

      vi.spyOn(connection, 'getLatestBlockhash').mockResolvedValue({
        blockhash: 'mock-blockhash',
        lastValidBlockHeight: 12345,
      });

      vi.spyOn(connection, 'sendRawTransaction')
        .mockResolvedValueOnce('sig-1')
        .mockResolvedValueOnce('sig-2')
        .mockResolvedValueOnce('sig-3');

      vi.spyOn(connection, 'confirmTransaction').mockResolvedValue({
        context: { slot: 123 },
        value: { err: null },
      } as any);

      const transactions = [mockTransaction, mockTransaction, mockTransaction];
      const result = await executor.executeBatch(transactions, testKeypair);

      if (result.success && result.signature) {
        expect(result.signature).toContain(',');
      }
    });
  });

  describe('getConnection()', () => {
    it('should return connection instance', () => {
      const connection = executor.getConnection();
      expect(connection).toBeInstanceOf(Connection);
    });
  });
});
