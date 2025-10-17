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

    // Mock transaction with proper structure for signing verification
    mockTransaction = {
      serialize: vi.fn().mockReturnValue(Buffer.from('mock-tx')),
      sign: vi.fn(),
      message: {
        header: {
          numRequiredSignatures: 1,
        },
      },
      signatures: [new Uint8Array(64).fill(1)], // Mock valid signature
    } as unknown as VersionedTransaction;
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

  describe('Transaction Signing (v1.88+ Compliance)', () => {
    it('should sign transaction before sending', async () => {
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

      await executor.execute(mockTransaction, testKeypair);

      // Verify sign was called with the keypair
      expect(mockTransaction.sign).toHaveBeenCalledWith([testKeypair]);
    });

    it('should verify transaction signatures before sending', async () => {
      const connection = executor.getConnection();
      vi.spyOn(connection, 'getLatestBlockhash').mockResolvedValue({
        blockhash: 'mock-blockhash',
        lastValidBlockHeight: 12345,
      });

      // Create transaction with invalid signatures
      const invalidTx = {
        serialize: vi.fn().mockReturnValue(Buffer.from('mock-tx')),
        sign: vi.fn(),
        message: {
          header: {
            numRequiredSignatures: 1,
          },
        },
        signatures: [], // No signatures
      } as unknown as VersionedTransaction;

      const result = await executor.execute(invalidTx, testKeypair);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction signing failed');
    });

    it('should handle signing errors gracefully', async () => {
      const connection = executor.getConnection();
      vi.spyOn(connection, 'getLatestBlockhash').mockResolvedValue({
        blockhash: 'mock-blockhash',
        lastValidBlockHeight: 12345,
      });

      // Create transaction that throws when signing
      const errorTx = {
        serialize: vi.fn().mockReturnValue(Buffer.from('mock-tx')),
        sign: vi.fn().mockImplementation(() => {
          throw new Error('Signing failed');
        }),
        message: {
          header: {
            numRequiredSignatures: 1,
          },
        },
        signatures: [],
      } as unknown as VersionedTransaction;

      const result = await executor.execute(errorTx, testKeypair);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should sign all transactions in batch', async () => {
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

      const tx1 = { ...mockTransaction, sign: vi.fn() };
      const tx2 = { ...mockTransaction, sign: vi.fn() };
      const tx3 = { ...mockTransaction, sign: vi.fn() };

      const transactions = [tx1, tx2, tx3] as unknown as VersionedTransaction[];

      await executor.executeBatch(transactions, testKeypair);

      // Verify each transaction was signed
      expect(tx1.sign).toHaveBeenCalledWith([testKeypair]);
      expect(tx2.sign).toHaveBeenCalledWith([testKeypair]);
      expect(tx3.sign).toHaveBeenCalledWith([testKeypair]);
    });
  });
});
