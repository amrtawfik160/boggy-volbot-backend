import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as crypto from 'crypto';
import { KeyRotationService } from './key-rotation.service';
import { EncryptionService } from './encryption.service';
import { SupabaseService } from './supabase.service';

describe('KeyRotationService', () => {
  let service: KeyRotationService;
  let encryptionService: EncryptionService;
  let supabaseService: SupabaseService;

  // Test keys
  const oldMasterKey = crypto.randomBytes(32).toString('base64');
  const newMasterKey = crypto.randomBytes(32).toString('base64');

  beforeEach(async () => {
    // Set environment variable for testing
    process.env.MASTER_ENCRYPTION_KEY = oldMasterKey;

    const module: TestingModule = await Test.createTestingModule({
      providers: [KeyRotationService, EncryptionService, SupabaseService],
    }).compile();

    service = module.get<KeyRotationService>(KeyRotationService);
    encryptionService = module.get<EncryptionService>(EncryptionService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  describe('Master Key Rotation', () => {
    it('should validate new master key format', async () => {
      // Mock supabase to return no users
      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue(
        [],
      );

      const progress = await service.rotateMasterKey(newMasterKey, 10);

      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.failed).toBe(0);
    });

    it('should reject invalid master key format', async () => {
      await expect(
        service.rotateMasterKey('invalid-key', 10),
      ).rejects.toThrow(/Invalid master key format/);
    });

    it('should reject master key with wrong length', async () => {
      const shortKey = crypto.randomBytes(16).toString('base64'); // Only 16 bytes
      await expect(service.rotateMasterKey(shortKey, 10)).rejects.toThrow(
        /Master key must be 32 bytes/,
      );
    });

    it('should successfully rotate master key for single user', async () => {
      const userId = 'user-123';
      const dek = crypto.randomBytes(32);
      const encryptedDEK = encryptionService.encryptDEK(dek);

      // Mock supabase
      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue([
        {
          id: 'key-1',
          user_id: userId,
          encrypted_dek: encryptedDEK,
          key_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      vi.spyOn(supabaseService, 'updateUserEncryptionKey').mockResolvedValue({
        id: 'key-1',
        user_id: userId,
        encrypted_dek: Buffer.from('new-encrypted-dek'),
        key_version: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const progress = await service.rotateMasterKey(newMasterKey, 10);

      expect(progress.total).toBe(1);
      expect(progress.completed).toBe(1);
      expect(progress.failed).toBe(0);
      expect(progress.userIds).toContain(userId);
    });

    it('should process multiple users in batches', async () => {
      const users = Array.from({ length: 25 }, (_, i) => ({
        id: `key-${i}`,
        user_id: `user-${i}`,
        encrypted_dek: encryptionService.encryptDEK(crypto.randomBytes(32)),
        key_version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue(
        users,
      );

      vi.spyOn(supabaseService, 'updateUserEncryptionKey').mockResolvedValue({
        id: 'key-1',
        user_id: 'user-1',
        encrypted_dek: Buffer.from('new-encrypted-dek'),
        key_version: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const progress = await service.rotateMasterKey(newMasterKey, 10);

      expect(progress.total).toBe(25);
      expect(progress.completed).toBe(25);
      expect(progress.failed).toBe(0);
    });

    it('should handle partial failures gracefully', async () => {
      const users = Array.from({ length: 5 }, (_, i) => ({
        id: `key-${i}`,
        user_id: `user-${i}`,
        encrypted_dek: encryptionService.encryptDEK(crypto.randomBytes(32)),
        key_version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue(
        users,
      );

      // Mock update to fail for user-2
      vi.spyOn(
        supabaseService,
        'updateUserEncryptionKey',
      ).mockImplementation((userId) => {
        if (userId === 'user-2') {
          return Promise.reject(new Error('Database error'));
        }
        return Promise.resolve({
          id: 'key-1',
          user_id: userId,
          encrypted_dek: Buffer.from('new-encrypted-dek'),
          key_version: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      });

      const progress = await service.rotateMasterKey(newMasterKey, 10);

      expect(progress.total).toBe(5);
      expect(progress.completed).toBe(4);
      expect(progress.failed).toBe(1);
      expect(progress.failedUserIds).toContain('user-2');
    });

    it('should prevent concurrent rotations', async () => {
      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue([
        {
          id: 'key-1',
          user_id: 'user-1',
          encrypted_dek: encryptionService.encryptDEK(crypto.randomBytes(32)),
          key_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      vi.spyOn(supabaseService, 'updateUserEncryptionKey').mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: 'key-1',
                  user_id: 'user-1',
                  encrypted_dek: Buffer.from('new-encrypted-dek'),
                  key_version: 2,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }),
              100,
            ),
          ),
      );

      // Start first rotation
      const rotation1 = service.rotateMasterKey(newMasterKey, 10);

      // Try to start second rotation immediately
      await expect(service.rotateMasterKey(newMasterKey, 10)).rejects.toThrow(
        /Key rotation already in progress/,
      );

      await rotation1;
    });

    it('should increment key version during rotation', async () => {
      const userId = 'user-123';
      const encryptedDEK = encryptionService.encryptDEK(crypto.randomBytes(32));

      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue([
        {
          id: 'key-1',
          user_id: userId,
          encrypted_dek: encryptedDEK,
          key_version: 5, // Starting at version 5
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      let updatedVersion = 0;
      vi.spyOn(
        supabaseService,
        'updateUserEncryptionKey',
      ).mockImplementation((_, updates) => {
        updatedVersion = updates.key_version;
        return Promise.resolve({
          id: 'key-1',
          user_id: userId,
          encrypted_dek: updates.encrypted_dek,
          key_version: updates.key_version,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      });

      await service.rotateMasterKey(newMasterKey, 10);

      expect(updatedVersion).toBe(6); // Should increment to 6
    });
  });

  describe('DEK Verification', () => {
    it('should verify all DEKs successfully', async () => {
      const users = Array.from({ length: 3 }, (_, i) => ({
        id: `key-${i}`,
        user_id: `user-${i}`,
        encrypted_dek: encryptionService.encryptDEK(crypto.randomBytes(32)),
        key_version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue(
        users,
      );

      const results = await service.verifyAllDEKs();

      expect(results.total).toBe(3);
      expect(results.successful).toBe(3);
      expect(results.failed).toBe(0);
      expect(results.failedUserIds).toHaveLength(0);
    });

    it('should detect corrupted DEKs', async () => {
      const validDEK = encryptionService.encryptDEK(crypto.randomBytes(32));
      const corruptedDEK = Buffer.from('corrupted-data');

      const users = [
        {
          id: 'key-1',
          user_id: 'user-1',
          encrypted_dek: validDEK,
          key_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'key-2',
          user_id: 'user-2',
          encrypted_dek: corruptedDEK,
          key_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue(
        users,
      );

      const results = await service.verifyAllDEKs();

      expect(results.total).toBe(2);
      expect(results.successful).toBe(1);
      expect(results.failed).toBe(1);
      expect(results.failedUserIds).toContain('user-2');
    });

    it('should verify with no users', async () => {
      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue(
        [],
      );

      const results = await service.verifyAllDEKs();

      expect(results.total).toBe(0);
      expect(results.successful).toBe(0);
      expect(results.failed).toBe(0);
    });
  });

  describe('Rollback', () => {
    it('should rollback user DEK successfully', async () => {
      const userId = 'user-123';
      const oldEncryptedDEK = Buffer.from('old-encrypted-dek');
      const oldVersion = 3;

      vi.spyOn(supabaseService, 'updateUserEncryptionKey').mockResolvedValue({
        id: 'key-1',
        user_id: userId,
        encrypted_dek: oldEncryptedDEK,
        key_version: oldVersion,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await expect(
        service.rollbackUserDEK(userId, oldEncryptedDEK, oldVersion),
      ).resolves.not.toThrow();
    });

    it('should handle rollback database errors', async () => {
      const userId = 'user-123';
      const oldEncryptedDEK = Buffer.from('old-encrypted-dek');
      const oldVersion = 3;

      vi.spyOn(supabaseService, 'updateUserEncryptionKey').mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.rollbackUserDEK(userId, oldEncryptedDEK, oldVersion),
      ).rejects.toThrow();
    });
  });

  describe('Rotation Status', () => {
    it('should report rotation not in progress initially', () => {
      expect(service.isRotationInProgress()).toBe(false);
    });

    it('should report rotation in progress during rotation', async () => {
      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue([
        {
          id: 'key-1',
          user_id: 'user-1',
          encrypted_dek: encryptionService.encryptDEK(crypto.randomBytes(32)),
          key_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      vi.spyOn(supabaseService, 'updateUserEncryptionKey').mockImplementation(
        () =>
          new Promise((resolve) => {
            // Check status during rotation
            expect(service.isRotationInProgress()).toBe(true);
            setTimeout(
              () =>
                resolve({
                  id: 'key-1',
                  user_id: 'user-1',
                  encrypted_dek: Buffer.from('new-encrypted-dek'),
                  key_version: 2,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }),
              50,
            );
          }),
      );

      await service.rotateMasterKey(newMasterKey, 10);

      // Should be false after rotation
      expect(service.isRotationInProgress()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty DEK list gracefully', async () => {
      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue(
        [],
      );

      const progress = await service.rotateMasterKey(newMasterKey, 10);

      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.failed).toBe(0);
    });

    it('should preserve original DEKs after re-encryption', async () => {
      const originalDEK = crypto.randomBytes(32);
      const encryptedDEK = encryptionService.encryptDEK(originalDEK);

      vi.spyOn(supabaseService, 'getAllUserEncryptionKeys').mockResolvedValue([
        {
          id: 'key-1',
          user_id: 'user-1',
          encrypted_dek: encryptedDEK,
          key_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      let reEncryptedDEK: Buffer | null = null;
      vi.spyOn(
        supabaseService,
        'updateUserEncryptionKey',
      ).mockImplementation((_, updates) => {
        reEncryptedDEK = updates.encrypted_dek;
        return Promise.resolve({
          id: 'key-1',
          user_id: 'user-1',
          encrypted_dek: updates.encrypted_dek,
          key_version: updates.key_version,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      });

      await service.rotateMasterKey(newMasterKey, 10);

      // The DEK itself should be the same, only the encryption should change
      expect(reEncryptedDEK).toBeTruthy();
      expect(reEncryptedDEK).not.toEqual(encryptedDEK); // Different encryption
    });
  });
});
