import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyManagementService } from './key-management.service';
import { EncryptionService } from './encryption.service';
import { SupabaseService } from './supabase.service';
import * as crypto from 'crypto';

describe('KeyManagementService', () => {
  let service: KeyManagementService;
  let encryptionService: EncryptionService;
  let supabaseService: SupabaseService;
  const testMasterKey = crypto.randomBytes(32).toString('base64');
  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Set up environment
    process.env.MASTER_ENCRYPTION_KEY = testMasterKey;

    // Create mock Supabase service
    supabaseService = {
      getUserEncryptionKey: vi.fn(),
      createUserEncryptionKey: vi.fn(),
      updateUserEncryptionKey: vi.fn(),
      deleteUserEncryptionKey: vi.fn(),
      getWalletsByUserIdWithPrivateKeys: vi.fn(),
      updateWalletPrivateKey: vi.fn(),
    } as any;

    encryptionService = new EncryptionService();
    service = new KeyManagementService(encryptionService, supabaseService);
  });

  describe('getUserDEK', () => {
    it('should retrieve existing DEK from database', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedDEK = encryptionService.encryptDEK(dek);

      vi.mocked(supabaseService.getUserEncryptionKey).mockResolvedValue({
        id: 'key-1',
        user_id: testUserId,
        encrypted_dek: encryptedDEK,
        key_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.getUserDEK(testUserId);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
      expect(supabaseService.getUserEncryptionKey).toHaveBeenCalledWith(testUserId);
    });

    it('should create new DEK if none exists', async () => {
      vi.mocked(supabaseService.getUserEncryptionKey).mockResolvedValue(null);
      vi.mocked(supabaseService.createUserEncryptionKey).mockResolvedValue({
        id: 'key-1',
        user_id: testUserId,
        encrypted_dek: Buffer.from('encrypted'),
        key_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.getUserDEK(testUserId);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
      expect(supabaseService.createUserEncryptionKey).toHaveBeenCalled();
    });

    it('should throw error on database failure', async () => {
      vi.mocked(supabaseService.getUserEncryptionKey).mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getUserDEK(testUserId)).rejects.toThrow(
        'Failed to retrieve user encryption key',
      );
    });
  });

  describe('createUserDEK', () => {
    it('should generate and store encrypted DEK', async () => {
      vi.mocked(supabaseService.createUserEncryptionKey).mockResolvedValue({
        id: 'key-1',
        user_id: testUserId,
        encrypted_dek: Buffer.from('encrypted'),
        key_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const dek = await service.createUserDEK(testUserId);

      expect(dek).toBeInstanceOf(Buffer);
      expect(dek.length).toBe(32);
      expect(supabaseService.createUserEncryptionKey).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: testUserId,
          encrypted_dek: expect.any(Buffer),
          key_version: 1,
        }),
      );
    });

    it('should encrypt DEK before storing', async () => {
      let storedEncryptedDEK: Buffer | null = null;

      vi.mocked(supabaseService.createUserEncryptionKey).mockImplementation(
        async (data) => {
          storedEncryptedDEK = data.encrypted_dek;
          return {
            id: 'key-1',
            user_id: testUserId,
            encrypted_dek: data.encrypted_dek,
            key_version: 1,
            created_at: new Date(),
            updated_at: new Date(),
          };
        },
      );

      await service.createUserDEK(testUserId);

      expect(storedEncryptedDEK).toBeInstanceOf(Buffer);
      // Encrypted DEK should be IV(16) + Ciphertext(32) + Tag(16) = 64 bytes
      expect(storedEncryptedDEK?.length).toBe(64);
    });
  });

  describe('encryptPrivateKeyForUser', () => {
    it('should encrypt private key with user DEK', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedDEK = encryptionService.encryptDEK(dek);

      vi.mocked(supabaseService.getUserEncryptionKey).mockResolvedValue({
        id: 'key-1',
        user_id: testUserId,
        encrypted_dek: encryptedDEK,
        key_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const privateKey = '5J3mBbAH58CpQ3Y5RNJpUKPE62SQ5tfcvU2JpbnkeyhfsYB1Jcn';
      const encrypted = await service.encryptPrivateKeyForUser(
        testUserId,
        privateKey,
      );

      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.length).toBeGreaterThan(privateKey.length);
    });
  });

  describe('decryptPrivateKeyForUser', () => {
    it('should decrypt private key with user DEK', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedDEK = encryptionService.encryptDEK(dek);

      vi.mocked(supabaseService.getUserEncryptionKey).mockResolvedValue({
        id: 'key-1',
        user_id: testUserId,
        encrypted_dek: encryptedDEK,
        key_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const privateKey = '5J3mBbAH58CpQ3Y5RNJpUKPE62SQ5tfcvU2JpbnkeyhfsYB1Jcn';
      const encrypted = encryptionService.encryptWithDEK(privateKey, dek);
      const decrypted = await service.decryptPrivateKeyForUser(
        testUserId,
        encrypted,
      );

      expect(decrypted).toBe(privateKey);
    });

    it('should fail with wrong user DEK', async () => {
      const dek1 = encryptionService.generateDEK();
      const dek2 = encryptionService.generateDEK();
      const encryptedDEK2 = encryptionService.encryptDEK(dek2);

      vi.mocked(supabaseService.getUserEncryptionKey).mockResolvedValue({
        id: 'key-1',
        user_id: testUserId,
        encrypted_dek: encryptedDEK2,
        key_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const privateKey = 'test-key';
      const encrypted = encryptionService.encryptWithDEK(privateKey, dek1);

      await expect(
        service.decryptPrivateKeyForUser(testUserId, encrypted),
      ).rejects.toThrow();
    });
  });

  describe('rotateUserDEK', () => {
    it('should rotate DEK and re-encrypt all wallets', async () => {
      const oldDEK = encryptionService.generateDEK();
      const encryptedOldDEK = encryptionService.encryptDEK(oldDEK);

      vi.mocked(supabaseService.getUserEncryptionKey).mockResolvedValue({
        id: 'key-1',
        user_id: testUserId,
        encrypted_dek: encryptedOldDEK,
        key_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const wallet1PrivateKey = 'private-key-1';
      const wallet2PrivateKey = 'private-key-2';

      const mockWallets = [
        {
          id: 'wallet-1',
          user_id: testUserId,
          address: 'address1',
          encrypted_private_key: encryptionService.encryptWithDEK(
            wallet1PrivateKey,
            oldDEK,
          ),
          label: 'Wallet 1',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'wallet-2',
          user_id: testUserId,
          address: 'address2',
          encrypted_private_key: encryptionService.encryptWithDEK(
            wallet2PrivateKey,
            oldDEK,
          ),
          label: 'Wallet 2',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      vi.mocked(
        supabaseService.getWalletsByUserIdWithPrivateKeys,
      ).mockResolvedValue(mockWallets);
      vi.mocked(supabaseService.updateWalletPrivateKey).mockResolvedValue(
        undefined,
      );
      vi.mocked(supabaseService.updateUserEncryptionKey).mockResolvedValue({
        id: 'key-1',
        user_id: testUserId,
        encrypted_dek: Buffer.from('new-encrypted'),
        key_version: 2,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await service.rotateUserDEK(testUserId);

      expect(supabaseService.updateWalletPrivateKey).toHaveBeenCalledTimes(2);
      expect(supabaseService.updateUserEncryptionKey).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          key_version: 2,
        }),
      );
    });

    it('should throw if user DEK not found', async () => {
      vi.mocked(supabaseService.getUserEncryptionKey).mockResolvedValue(null);

      await expect(service.rotateUserDEK(testUserId)).rejects.toThrow(
        'Failed to rotate user encryption key',
      );
    });
  });

  describe('deleteUserDEK', () => {
    it('should delete user DEK from database', async () => {
      vi.mocked(supabaseService.deleteUserEncryptionKey).mockResolvedValue(
        undefined,
      );

      await service.deleteUserDEK(testUserId);

      expect(supabaseService.deleteUserEncryptionKey).toHaveBeenCalledWith(
        testUserId,
      );
    });
  });

  describe('Full Workflow Integration', () => {
    it('should complete full encryption workflow for new user', async () => {
      // Simulate new user (no DEK exists)
      let storedDEK: any = null;

      vi.mocked(supabaseService.getUserEncryptionKey).mockImplementation(
        async () => storedDEK,
      );

      vi.mocked(supabaseService.createUserEncryptionKey).mockImplementation(
        async (data) => {
          storedDEK = {
            id: 'key-1',
            user_id: testUserId,
            encrypted_dek: data.encrypted_dek,
            key_version: 1,
            created_at: new Date(),
            updated_at: new Date(),
          };
          return storedDEK;
        },
      );

      // 1. Encrypt private key for new user
      const privateKey = '5J3mBbAH58CpQ3Y5RNJpUKPE62SQ5tfcvU2JpbnkeyhfsYB1Jcn';
      const encrypted = await service.encryptPrivateKeyForUser(
        testUserId,
        privateKey,
      );

      expect(encrypted).toBeInstanceOf(Buffer);
      expect(storedDEK).not.toBeNull();

      // 2. Decrypt private key
      const decrypted = await service.decryptPrivateKeyForUser(
        testUserId,
        encrypted,
      );

      expect(decrypted).toBe(privateKey);
    });

    it('should handle multiple wallets for same user', async () => {
      const dek = encryptionService.generateDEK();
      const encryptedDEK = encryptionService.encryptDEK(dek);

      vi.mocked(supabaseService.getUserEncryptionKey).mockResolvedValue({
        id: 'key-1',
        user_id: testUserId,
        encrypted_dek: encryptedDEK,
        key_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const keys = [
        '5J3mBbAH58CpQ3Y5RNJpUKPE62SQ5tfcvU2JpbnkeyhfsYB1Jcn',
        'KxYMZmkJhN6f3DgUJh7h8qvXKqP8pB7UcJ9x4mH2qN5pB6g7cD8e',
        'L3tHpN9xQmF2vYbRcJ4kD6eB8aZ5wU7pM1qT3yS9oK2nX4jG6hV8',
      ];

      const encrypted = await Promise.all(
        keys.map((key) => service.encryptPrivateKeyForUser(testUserId, key)),
      );

      const decrypted = await Promise.all(
        encrypted.map((enc) =>
          service.decryptPrivateKeyForUser(testUserId, enc),
        ),
      );

      expect(decrypted).toEqual(keys);
    });
  });
});
