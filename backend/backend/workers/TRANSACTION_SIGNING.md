# Transaction Signing in Solana Volume Bot

## Overview

This document describes the transaction signing flow for the Solana Volume Bot, updated for @solana/web3.js v1.88+ best practices.

## Current Version

- **@solana/web3.js**: v1.98.4 (exceeds v1.88+ requirement)

## Transaction Signing Flow

### 1. Transaction Building

Transaction builders (in `utils/swapOnlyAmm.ts`) create `VersionedTransaction` instances:

```typescript
// getBuyTx, getSellTx, getBuyTxWithJupiter, getSellTxWithJupiter
const willSendTx = await buildSimpleTransaction(...);
if (willSendTx instanceof VersionedTransaction) {
  willSendTx.sign([wallet]);  // Pre-sign for compatibility
  return willSendTx;
}
```

**Note**: Transaction builders currently pre-sign transactions for backward compatibility with existing code that may pass pre-signed transactions.

### 2. Transaction Execution

Executors (LegacyExecutor, JitoExecutor) handle transaction execution:

```typescript
// Both executors now sign transactions before execution
transaction.sign([signerKeypair]);

// Verify signatures are present
if (!this.isTransactionSigned(transaction)) {
  throw new Error('Transaction signing failed');
}
```

**Important**: Executors ALWAYS re-sign transactions to ensure:
- Fresh signatures with current blockhash
- Proper error handling at execution time
- Consistent behavior across all execution paths

### 3. Double-Signing Behavior

With @solana/web3.js v1.88+:

- **VersionedTransaction.sign()** replaces existing signatures for the same signer
- This is SAFE and intentional - executor signing ensures fresh signatures
- Pre-signing in builders is kept for backward compatibility but gets replaced

## Best Practices (v1.88+)

### For VersionedTransaction Signing

1. **Sign Just Before Sending**
   ```typescript
   // Get fresh blockhash
   const latestBlockhash = await connection.getLatestBlockhash('processed');

   // Sign transaction
   transaction.sign([signerKeypair]);

   // Send immediately
   const signature = await connection.sendRawTransaction(transaction.serialize());
   ```

2. **Verify Signatures**
   ```typescript
   const numRequiredSignatures = transaction.message.header.numRequiredSignatures;
   const isValid = transaction.signatures.length >= numRequiredSignatures &&
                   transaction.signatures.every(sig => sig !== null && sig.length === 64);
   ```

3. **Use Proper Commitment Levels**
   - `'processed'` for latest blockhash (fastest)
   - `'confirmed'` for transaction confirmation (recommended)
   - `'finalized'` for maximum security (slowest)

## Migration from Legacy Transaction

### Old Pattern (Legacy Transaction)
```typescript
const transaction = new Transaction();
transaction.recentBlockhash = blockhash;
transaction.feePayer = keypair.publicKey;
transaction.sign(keypair);  // Signs in-place
```

### New Pattern (VersionedTransaction)
```typescript
const transaction = new VersionedTransaction(message);
transaction.sign([keypair]);  // Takes array of signers
```

**Key Differences**:
- VersionedTransaction.sign() takes an ARRAY of Keypairs
- No `partialSign()` method - use `sign()` for all signing
- Signatures are replaced, not accumulated (for same signer)

## Error Handling

### Common Signing Errors

1. **Missing Required Signatures**
   ```
   Error: Transaction signing failed - missing required signatures
   ```
   Solution: Ensure all required signers are provided

2. **Invalid Signature Length**
   ```
   Error: Signature must be 64 bytes
   ```
   Solution: Use proper Keypair instances, not raw bytes

3. **Stale Blockhash**
   ```
   Error: Blockhash not found
   ```
   Solution: Get fresh blockhash before signing

## Testing

All executor tests verify:
- ✅ Transactions are properly signed before execution
- ✅ Signature verification works correctly
- ✅ Error handling for signing failures
- ✅ Batch/bundle signing for multiple transactions

## References

- [Solana Versioned Transactions](https://solana.com/docs/advanced/versions)
- [@solana/web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)
- [Task 3.4: Upgrade Transaction Signing](/.taskmaster/tasks/task-3.md)
