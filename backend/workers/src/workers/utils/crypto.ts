import * as crypto from 'crypto';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Decrypt a private key using AES-256-GCM
 */
export function decryptPrivateKey(encryptedData: Buffer): string {
  const masterKey = process.env.MASTER_ENCRYPTION_KEY || '';
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY not set in environment');
  }

  const key = crypto.scryptSync(masterKey, 'salt', 32);

  const iv = encryptedData.subarray(0, 16);
  const tag = encryptedData.subarray(encryptedData.length - 16);
  const encrypted = encryptedData.subarray(16, encryptedData.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypt a private key using AES-256-GCM
 */
export function encryptPrivateKey(plainPrivateKey: string): Buffer {
  const masterKey = process.env.MASTER_ENCRYPTION_KEY || '';
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY not set in environment');
  }

  const key = crypto.scryptSync(masterKey, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainPrivateKey, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]);
}

/**
 * Decrypt and create a Keypair from encrypted private key
 */
export function getKeypairFromEncrypted(encryptedPrivateKey: Buffer): Keypair {
  const privateKey = decryptPrivateKey(encryptedPrivateKey);
  return Keypair.fromSecretKey(bs58.decode(privateKey));
}
