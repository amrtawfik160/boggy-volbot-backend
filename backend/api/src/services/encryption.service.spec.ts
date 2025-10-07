import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from './encryption.service';
import * as crypto from 'crypto';

describe('EncryptionService', () => {
  let service: EncryptionService;
  const testMasterKey = crypto.randomBytes(32).toString('base64');

  beforeEach(() => {
    // Set up environment
    process.env.MASTER_ENCRYPTION_KEY = testMasterKey;
    service = new EncryptionService();
  });

  describe('KEK Initialization', () => {
    it('should initialize KEK on construction', () => {
      expect(service).toBeDefined();
    });

    it('should throw error if MASTER_ENCRYPTION_KEY is not set', () => {
      delete process.env.MASTER_ENCRYPTION_KEY;
      expect(() => new EncryptionService()).toThrow('MASTER_ENCRYPTION_KEY not set in environment');
      process.env.MASTER_ENCRYPTION_KEY = testMasterKey;
    });

    it('should throw error if MASTER_ENCRYPTION_KEY is invalid base64', () => {
      process.env.MASTER_ENCRYPTION_KEY = 'invalid-base64!!!';
      expect(() => new EncryptionService()).toThrow('MASTER_ENCRYPTION_KEY must be a valid base64-encoded 32-byte key');
      process.env.MASTER_ENCRYPTION_KEY = testMasterKey;
    });

    it('should throw error if MASTER_ENCRYPTION_KEY is wrong length', () => {
      process.env.MASTER_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
      expect(() => new EncryptionService()).toThrow('MASTER_ENCRYPTION_KEY must be a valid base64-encoded 32-byte key');
      process.env.MASTER_ENCRYPTION_KEY = testMasterKey;
    });
  });

  describe('DEK Generation and Encryption', () => {
    it('should generate a 32-byte DEK', () => {
      const dek = service.generateDEK();
      expect(dek).toBeInstanceOf(Buffer);
      expect(dek.length).toBe(32);
    });

    it('should encrypt and decrypt a DEK successfully', () => {
      const dek = service.generateDEK();
      const encryptedDEK = service.encryptDEK(dek);

      expect(encryptedDEK).toBeInstanceOf(Buffer);
      // IV (16) + Ciphertext (32) + Tag (16) = 64 bytes
      expect(encryptedDEK.length).toBe(64);

      const decryptedDEK = service.decryptDEK(encryptedDEK);
      expect(decryptedDEK).toBeInstanceOf(Buffer);
      expect(decryptedDEK.length).toBe(32);
      expect(Buffer.compare(dek, decryptedDEK)).toBe(0);
    });

    it('should throw error when decrypting DEK with wrong key', () => {
      const dek = service.generateDEK();
      const encryptedDEK = service.encryptDEK(dek);

      // Create a new service with different master key
      const newMasterKey = crypto.randomBytes(32).toString('base64');
      process.env.MASTER_ENCRYPTION_KEY = newMasterKey;
      const newService = new EncryptionService();

      expect(() => newService.decryptDEK(encryptedDEK)).toThrow('Unable to decrypt DEK. Authentication failed.');

      // Restore original key
      process.env.MASTER_ENCRYPTION_KEY = testMasterKey;
    });

    it('should throw error when decrypting tampered DEK', () => {
      const dek = service.generateDEK();
      const encryptedDEK = service.encryptDEK(dek);

      // Tamper with the encrypted data
      encryptedDEK[20] ^= 0xFF;

      expect(() => service.decryptDEK(encryptedDEK)).toThrow('Unable to decrypt DEK. Authentication failed.');
    });
  });

  describe('Data Encryption with DEK', () => {
    it('should encrypt and decrypt private key with DEK', () => {
      const privateKey = '5J3mBbAH58CpQ3Y5RNJpUKPE62SQ5tfcvU2JpbnkeyhfsYB1Jcn';
      const dek = service.generateDEK();

      const encrypted = service.encryptWithDEK(privateKey, dek);
      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.length).toBeGreaterThan(privateKey.length);

      const decrypted = service.decryptWithDEK(encrypted, dek);
      expect(decrypted).toBe(privateKey);
    });

    it('should throw error when DEK is wrong length', () => {
      const privateKey = 'test-private-key';
      const shortDEK = Buffer.from('short');

      expect(() => service.encryptWithDEK(privateKey, shortDEK)).toThrow('Encryption with DEK failed');
    });

    it('should throw error when decrypting with wrong DEK', () => {
      const privateKey = 'test-private-key';
      const dek1 = service.generateDEK();
      const dek2 = service.generateDEK();

      const encrypted = service.encryptWithDEK(privateKey, dek1);

      expect(() => service.decryptWithDEK(encrypted, dek2)).toThrow('Unable to decrypt data. Authentication failed.');
    });

    it('should throw error when decrypting tampered data', () => {
      const privateKey = 'test-private-key';
      const dek = service.generateDEK();

      const encrypted = service.encryptWithDEK(privateKey, dek);

      // Tamper with the encrypted data
      encrypted[20] ^= 0xFF;

      expect(() => service.decryptWithDEK(encrypted, dek)).toThrow('Unable to decrypt data. Authentication failed.');
    });

    it('should handle empty string encryption', () => {
      const emptyString = '';
      const dek = service.generateDEK();

      const encrypted = service.encryptWithDEK(emptyString, dek);
      const decrypted = service.decryptWithDEK(encrypted, dek);

      expect(decrypted).toBe(emptyString);
    });

    it('should handle unicode characters', () => {
      const unicode = '🔐 Secure wallet key 密钥 مفتاح';
      const dek = service.generateDEK();

      const encrypted = service.encryptWithDEK(unicode, dek);
      const decrypted = service.decryptWithDEK(encrypted, dek);

      expect(decrypted).toBe(unicode);
    });
  });

  describe('Full Encryption Flow (MEK -> KEK -> DEK -> Data)', () => {
    it('should complete full encryption/decryption flow', () => {
      // 1. Generate DEK
      const dek = service.generateDEK();
      expect(dek.length).toBe(32);

      // 2. Encrypt DEK with KEK
      const encryptedDEK = service.encryptDEK(dek);

      // 3. Encrypt private key with DEK
      const privateKey = '5J3mBbAH58CpQ3Y5RNJpUKPE62SQ5tfcvU2JpbnkeyhfsYB1Jcn';
      const encryptedPrivateKey = service.encryptWithDEK(privateKey, dek);

      // 4. Simulate storage: we only keep encryptedDEK and encryptedPrivateKey

      // 5. Decrypt DEK with KEK
      const decryptedDEK = service.decryptDEK(encryptedDEK);
      expect(Buffer.compare(dek, decryptedDEK)).toBe(0);

      // 6. Decrypt private key with DEK
      const decryptedPrivateKey = service.decryptWithDEK(encryptedPrivateKey, decryptedDEK);
      expect(decryptedPrivateKey).toBe(privateKey);
    });

    it('should encrypt different data with same DEK independently', () => {
      const dek = service.generateDEK();
      const data1 = 'private-key-1';
      const data2 = 'private-key-2';

      const encrypted1 = service.encryptWithDEK(data1, dek);
      const encrypted2 = service.encryptWithDEK(data2, dek);

      // Different IVs should produce different ciphertexts
      expect(Buffer.compare(encrypted1, encrypted2)).not.toBe(0);

      const decrypted1 = service.decryptWithDEK(encrypted1, dek);
      const decrypted2 = service.decryptWithDEK(encrypted2, dek);

      expect(decrypted1).toBe(data1);
      expect(decrypted2).toBe(data2);
    });
  });

  describe('Legacy Methods', () => {
    it('should encrypt and decrypt with legacy methods', () => {
      const privateKey = 'test-private-key';

      const encrypted = service.encrypt(privateKey);
      expect(encrypted).toBeInstanceOf(Buffer);

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(privateKey);
    });

    it('should handle decryption errors in legacy methods', () => {
      const encrypted = service.encrypt('test');

      // Tamper with data
      encrypted[20] ^= 0xFF;

      expect(() => service.decrypt(encrypted)).toThrow('Unable to decrypt wallet. Data may be corrupted.');
    });
  });

  describe('Hash Function', () => {
    it('should hash a value consistently', () => {
      const value = 'test-value';
      const hash1 = service.hash(value);
      const hash2 = service.hash(value);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex = 64 chars
    });

    it('should produce different hashes for different values', () => {
      const hash1 = service.hash('value1');
      const hash2 = service.hash('value2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long data', () => {
      const longData = 'x'.repeat(10000);
      const dek = service.generateDEK();

      const encrypted = service.encryptWithDEK(longData, dek);
      const decrypted = service.decryptWithDEK(encrypted, dek);

      expect(decrypted).toBe(longData);
    });

    it('should handle special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;\':",.<>?/\\`~\n\r\t';
      const dek = service.generateDEK();

      const encrypted = service.encryptWithDEK(specialChars, dek);
      const decrypted = service.decryptWithDEK(encrypted, dek);

      expect(decrypted).toBe(specialChars);
    });
  });
});
