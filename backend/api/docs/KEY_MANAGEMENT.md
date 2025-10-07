# Wallet Encryption Key Management Architecture

## Overview

This document describes the three-tier key hierarchy used to encrypt wallet private keys in the Solana Volume Bot application. The architecture implements envelope encryption with per-user Data Encryption Keys (DEKs), a Key Encryption Key (KEK), and a Master Key.

## Key Hierarchy

```
┌─────────────────────────────────────────────────────┐
│         MASTER_ENCRYPTION_KEY (Environment)         │
│              (32-byte secret, env var)              │
└─────────────────────────┬───────────────────────────┘
                          │
                          │ Used to derive
                          ▼
              ┌───────────────────────┐
              │   KEK (Key Encryption │
              │         Key)          │
              │   (Derived via HKDF)  │
              └───────────┬───────────┘
                          │
                          │ Encrypts
                          ▼
          ┌───────────────────────────────┐
          │  User DEKs (Per-User Keys)    │
          │  (32-byte AES-256 keys)       │
          │  Stored encrypted in database │
          └───────────┬───────────────────┘
                      │
                      │ Encrypts
                      ▼
        ┌─────────────────────────────┐
        │   Wallet Private Keys       │
        │  (Stored encrypted in DB)   │
        └─────────────────────────────┘
```

## Key Types and Roles

### 1. Master Encryption Key (MEK)
- **Source**: Environment variable `MASTER_ENCRYPTION_KEY`
- **Format**: 32-byte base64-encoded string
- **Purpose**: Root secret used to derive the KEK
- **Storage**: Environment variables, secret manager (production)
- **Rotation**: Requires re-derivation of KEK and re-encryption of all DEKs
- **Access**: Only accessible to the encryption service

### 2. Key Encryption Key (KEK)
- **Derivation**: HKDF-SHA256 from Master Key
- **Format**: 32-byte key
- **Purpose**: Encrypts/decrypts per-user DEKs
- **Storage**: In-memory only, derived on service initialization
- **Rotation**: Triggered by master key rotation
- **Algorithm**: AES-256-GCM

### 3. Data Encryption Keys (DEKs)
- **Generation**: Randomly generated per user
- **Format**: 32-byte AES-256 key
- **Purpose**: Encrypts/decrypts wallet private keys for a specific user
- **Storage**: Database, encrypted with KEK
- **Rotation**: Per-user basis, independent of other users
- **Algorithm**: AES-256-GCM

### 4. Encrypted Private Keys
- **Encryption**: AES-256-GCM with user's DEK
- **Storage**: Database, `wallets.encrypted_private_key` column
- **Format**: IV (16 bytes) + Ciphertext (variable) + Auth Tag (16 bytes)
- **Access**: Decrypted only during transaction signing

## Database Schema

### user_encryption_keys table
```sql
CREATE TABLE user_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_dek BYTEA NOT NULL,  -- DEK encrypted with KEK
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, key_version)
);

CREATE INDEX idx_user_encryption_keys_user_id ON user_encryption_keys(user_id);
```

### wallets table (existing, with notes)
```sql
-- encrypted_private_key contains:
-- [IV (16 bytes)][Encrypted Private Key (variable)][Auth Tag (16 bytes)]
-- Encrypted using the user's DEK
```

## Encryption Flow

### Creating a New Wallet

1. **Check for User DEK**:
   ```typescript
   let dek = await getUserDEK(userId);
   if (!dek) {
     dek = await createUserDEK(userId);
   }
   ```

2. **Generate/Import Private Key**:
   - User provides private key OR system generates new keypair

3. **Encrypt Private Key with DEK**:
   ```typescript
   const iv = crypto.randomBytes(16);
   const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
   const encrypted = Buffer.concat([
     cipher.update(privateKey, 'utf8'),
     cipher.final()
   ]);
   const tag = cipher.getAuthTag();
   const encryptedPrivateKey = Buffer.concat([iv, encrypted, tag]);
   ```

4. **Store in Database**:
   - Save `encryptedPrivateKey` to `wallets.encrypted_private_key`

### Signing a Transaction

1. **Retrieve User DEK**:
   ```typescript
   const encryptedDEK = await db.getUserEncryptedDEK(userId);
   const dek = decryptDEKWithKEK(encryptedDEK);
   ```

2. **Decrypt Private Key**:
   ```typescript
   const encryptedPrivateKey = await db.getWalletPrivateKey(walletId);
   const privateKey = decryptPrivateKey(encryptedPrivateKey, dek);
   ```

3. **Sign Transaction**:
   ```typescript
   const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
   const signature = await transaction.sign(keypair);
   ```

4. **Secure Cleanup**:
   ```typescript
   // Overwrite sensitive data
   privateKey = null;
   dek = null;
   keypair = null;
   ```

## Key Generation

### Master Key Generation (One-Time Setup)
```bash
# Generate a secure 32-byte key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Set in environment
export MASTER_ENCRYPTION_KEY="<generated-key>"
```

### KEK Derivation (On Service Initialization)
```typescript
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

const masterKey = Buffer.from(process.env.MASTER_ENCRYPTION_KEY, 'base64');
const info = Buffer.from('kek-v1', 'utf8');
const kek = hkdf(sha256, masterKey, undefined, info, 32);
```

### DEK Generation (Per User)
```typescript
const dek = crypto.randomBytes(32); // 256 bits for AES-256
```

## Key Rotation

### Rotating DEKs (Per-User)

1. **Generate New DEK**:
   ```typescript
   const newDEK = crypto.randomBytes(32);
   ```

2. **Encrypt New DEK with KEK**:
   ```typescript
   const encryptedNewDEK = encryptWithKEK(newDEK);
   ```

3. **Re-encrypt All User Wallets**:
   ```typescript
   for (const wallet of userWallets) {
     const privateKey = decryptPrivateKey(wallet.encrypted_private_key, oldDEK);
     const newEncryptedKey = encryptPrivateKey(privateKey, newDEK);
     await updateWallet(wallet.id, newEncryptedKey);
   }
   ```

4. **Update User DEK Record**:
   ```typescript
   await db.createUserDEK(userId, encryptedNewDEK, newVersion);
   await db.archiveOldDEK(userId, oldVersion);
   ```

### Rotating Master Key (Global)

**⚠️ WARNING**: This requires re-encrypting ALL user DEKs. Plan carefully.

1. **Generate New Master Key**:
   ```bash
   NEW_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
   ```

2. **Derive New KEK**:
   ```typescript
   const newKEK = deriveKEK(newMasterKey);
   ```

3. **Re-encrypt All DEKs**:
   ```typescript
   // For each user
   const dek = decryptDEKWithKEK(encryptedDEK, oldKEK);
   const newEncryptedDEK = encryptDEKWithKEK(dek, newKEK);
   await db.updateUserDEK(userId, newEncryptedDEK);
   ```

4. **Update Environment**:
   ```bash
   export MASTER_ENCRYPTION_KEY="$NEW_KEY"
   ```

5. **Rolling Restart**:
   - Restart services to pick up new master key
   - Verify all services can decrypt DEKs

### Rotation Schedule Recommendations

- **DEK Rotation**: On-demand or annually per user
- **Master Key Rotation**: Annually or after suspected compromise
- **KEK Rotation**: Coupled with master key rotation

## Security Best Practices

### Key Storage

1. **Master Key**:
   - Store in secret manager (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Never commit to version control
   - Rotate annually
   - Restrict access via IAM policies

2. **KEK**:
   - Keep in memory only
   - Never log or persist
   - Derive on service start

3. **DEKs**:
   - Always store encrypted
   - Decrypt only when needed
   - Clear from memory after use

4. **Private Keys**:
   - Decrypt only during transaction signing
   - Never log or persist in plaintext
   - Overwrite memory after use

### Access Control

- Only the `EncryptionService` should access the master key
- Only the `WalletService` should decrypt private keys
- Use dependency injection to control service access
- Implement audit logging for all decryption operations

### Monitoring

- Log all key rotation events
- Alert on decryption failures
- Monitor for unusual decryption patterns
- Track key age for rotation reminders

## Error Handling

### Decryption Failures

```typescript
try {
  const privateKey = decryptPrivateKey(encryptedData, dek);
} catch (error) {
  if (error.message.includes('auth')) {
    // Authentication tag mismatch - data tampered or wrong key
    logger.error('Decryption authentication failed', { walletId, userId });
    throw new Error('Unable to decrypt wallet. Data may be corrupted.');
  }
  throw error;
}
```

### Key Not Found

```typescript
const dek = await getUserDEK(userId);
if (!dek) {
  logger.warn('User DEK not found, generating new one', { userId });
  return await createUserDEK(userId);
}
```

### Master Key Missing

```typescript
if (!process.env.MASTER_ENCRYPTION_KEY) {
  logger.fatal('MASTER_ENCRYPTION_KEY not configured');
  process.exit(1);
}
```

## Migration Plan

### Phase 1: Create DEK Infrastructure
1. Create `user_encryption_keys` table
2. Implement `KeyManagementService` with KEK derivation
3. Add DEK generation and encryption functions

### Phase 2: Migrate Existing Wallets
1. Generate DEK for each user with existing wallets
2. Re-encrypt wallet private keys with user's DEK
3. Store encrypted DEKs in database
4. Verify all wallets can be decrypted

### Phase 3: Update Application Code
1. Update `EncryptionService` to use DEK/KEK architecture
2. Update `WalletsController` to use new encryption flow
3. Update transaction signing to decrypt with DEKs

### Phase 4: Cleanup
1. Remove direct master key encryption code
2. Update documentation
3. Add monitoring and alerts

## Compliance Notes

This architecture supports:
- **PCI DSS**: Key separation, encryption at rest
- **SOC 2**: Access controls, audit logging, key rotation
- **GDPR**: Right to deletion (delete user's DEK), data encryption

## References

- [NIST SP 800-57: Key Management](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [AWS Envelope Encryption](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#enveloping)
