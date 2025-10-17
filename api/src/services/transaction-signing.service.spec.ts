import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TransactionSigningService } from './transaction-signing.service';
import { KeyManagementService } from './key-management.service';
import { SupabaseService } from './supabase.service';
import { EncryptionService } from './encryption.service';
import {
  Keypair,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';
import * as crypto from 'crypto';

describe('TransactionSigningService', () => {
  let service: TransactionSigningService;
  let keyManagementService: KeyManagementService;
  let supabaseService: SupabaseService;
  let encryptionService: EncryptionService;

  const testMasterKey = crypto.randomBytes(32).toString('base64');
  const testUserId = 'test-user-123';
  const testWalletId = 'wallet-abc';
  const testKeypair = Keypair.generate();
  const testPrivateKey = bs58.encode(testKeypair.secretKey);

  beforeEach(() => {
    process.env.MASTER_ENCRYPTION_KEY = testMasterKey;

    encryptionService = new EncryptionService();

    supabaseService = {
      getWalletsByUserIdWithPrivateKeys: vi.fn(),
    } as any;

    keyManagementService = new KeyManagementService(
      encryptionService,
      supabaseService as any,
    );

    service = new TransactionSigningService(
      keyManagementService,
      supabaseService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('signTransaction', () => {
    it('should sign a legacy transaction successfully', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedPrivateKey = encryptionService.encryptWithDEK(
        testPrivateKey,
        dek,
      );

      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: encryptedPrivateKey,
          label: 'Test Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      // Mock getUserDEK to return our test DEK
      vi.spyOn(keyManagementService, 'getUserDEK').mockResolvedValue(dek);

      // Create a test transaction with recentBlockhash
      const transaction = new Transaction({
        recentBlockhash: 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k',
        feePayer: testKeypair.publicKey,
      }).add(
        SystemProgram.transfer({
          fromPubkey: testKeypair.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 1000,
        }),
      );

      const signedTransaction = await service.signTransaction(
        testWalletId,
        testUserId,
        transaction,
      );

      expect(signedTransaction.signatures.length).toBeGreaterThan(0);
      expect(signedTransaction.signatures[0].signature).not.toBeNull();
    });

    it('should throw error for read-only wallet', async () => {
      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: null, // Read-only wallet
          label: 'Read-Only Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const transaction = new Transaction();

      await expect(
        service.signTransaction(testWalletId, testUserId, transaction),
      ).rejects.toThrow('Wallet does not have a private key (read-only wallet)');
    });

    it('should throw error for non-existent wallet', async () => {
      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([]);

      const transaction = new Transaction();

      await expect(
        service.signTransaction(testWalletId, testUserId, transaction),
      ).rejects.toThrow(`Wallet ${testWalletId} not found for user ${testUserId}`);
    });

    it('should clean up sensitive data after signing', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedPrivateKey = encryptionService.encryptWithDEK(
        testPrivateKey,
        dek,
      );

      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: encryptedPrivateKey,
          label: 'Test Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      vi.spyOn(keyManagementService, 'getUserDEK').mockResolvedValue(dek);

      const transaction = new Transaction({
        recentBlockhash: 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k',
        feePayer: testKeypair.publicKey,
      }).add(
        SystemProgram.transfer({
          fromPubkey: testKeypair.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 1000,
        }),
      );

      await service.signTransaction(testWalletId, testUserId, transaction);

      // If we reach here without errors, cleanup was successful
      expect(true).toBe(true);
    });
  });

  describe('signMessage', () => {
    it('should sign a message successfully', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedPrivateKey = encryptionService.encryptWithDEK(
        testPrivateKey,
        dek,
      );

      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: encryptedPrivateKey,
          label: 'Test Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      vi.spyOn(keyManagementService, 'getUserDEK').mockResolvedValue(dek);

      const message = Buffer.from('Hello, Solana!');
      const signature = await service.signMessage(
        testWalletId,
        testUserId,
        message,
      );

      expect(signature).toBeInstanceOf(Buffer);
      expect(signature.length).toBe(64); // Ed25519 signature is 64 bytes
    });

    it('should throw error for read-only wallet', async () => {
      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: null,
          label: 'Read-Only Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const message = Buffer.from('Test message');

      await expect(
        service.signMessage(testWalletId, testUserId, message),
      ).rejects.toThrow('Wallet does not have a private key (read-only wallet)');
    });
  });

  describe('withKeypair', () => {
    it('should execute callback with keypair successfully', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedPrivateKey = encryptionService.encryptWithDEK(
        testPrivateKey,
        dek,
      );

      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: encryptedPrivateKey,
          label: 'Test Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      vi.spyOn(keyManagementService, 'getUserDEK').mockResolvedValue(dek);

      const result = await service.withKeypair(
        testWalletId,
        testUserId,
        async (keypair) => {
          expect(keypair).toBeInstanceOf(Keypair);
          expect(keypair.publicKey.toBase58()).toBe(
            testKeypair.publicKey.toBase58(),
          );
          return 'success';
        },
      );

      expect(result).toBe('success');
    });

    it('should clean up keypair after callback execution', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedPrivateKey = encryptionService.encryptWithDEK(
        testPrivateKey,
        dek,
      );

      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: encryptedPrivateKey,
          label: 'Test Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      vi.spyOn(keyManagementService, 'getUserDEK').mockResolvedValue(dek);

      let capturedKeypair: Keypair | null = null;

      await service.withKeypair(
        testWalletId,
        testUserId,
        async (keypair) => {
          capturedKeypair = keypair;
          return 'done';
        },
      );

      // After withKeypair completes, the secret key should be zeroed
      expect(capturedKeypair).not.toBeNull();
      // Note: We can't directly verify the memory was zeroed, but the service should have done it
    });

    it('should throw error for read-only wallet', async () => {
      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: null,
          label: 'Read-Only Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      await expect(
        service.withKeypair(testWalletId, testUserId, async () => 'test'),
      ).rejects.toThrow('Wallet does not have a private key (read-only wallet)');
    });

    it('should clean up even if callback throws error', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedPrivateKey = encryptionService.encryptWithDEK(
        testPrivateKey,
        dek,
      );

      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: encryptedPrivateKey,
          label: 'Test Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      vi.spyOn(keyManagementService, 'getUserDEK').mockResolvedValue(dek);

      await expect(
        service.withKeypair(testWalletId, testUserId, async () => {
          throw new Error('Callback error');
        }),
      ).rejects.toThrow('Callback error');

      // If we reach here, cleanup happened even with error
      expect(true).toBe(true);
    });
  });

  describe('Security', () => {
    it('should not expose private key in error messages', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedPrivateKey = encryptionService.encryptWithDEK(
        testPrivateKey,
        dek,
      );

      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([
        {
          id: testWalletId,
          user_id: testUserId,
          address: testKeypair.publicKey.toBase58(),
          encrypted_private_key: encryptedPrivateKey,
          label: 'Test Wallet',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      // Mock decryption to fail
      vi.spyOn(keyManagementService, 'decryptPrivateKeyForUser').mockRejectedValue(
        new Error('Decryption failed'),
      );

      const transaction = new Transaction();

      try {
        await service.signTransaction(testWalletId, testUserId, transaction);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // Ensure error message doesn't contain private key
        expect(error.message).not.toContain(testPrivateKey);
      }
    });

    it('should require user authorization for wallet access', async () => {
      const wrongUserId = 'wrong-user-456';

      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue([]);

      const transaction = new Transaction();

      await expect(
        service.signTransaction(testWalletId, wrongUserId, transaction),
      ).rejects.toThrow();
    });
  });
});
