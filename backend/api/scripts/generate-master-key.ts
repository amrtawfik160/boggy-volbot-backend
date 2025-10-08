#!/usr/bin/env ts-node
/**
 * Master Key Generation Script
 *
 * Generates a cryptographically secure 32-byte master key for encryption.
 *
 * Usage:
 *   npm run generate-master-key
 */

import * as crypto from 'crypto';

function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║         MASTER KEY GENERATION                         ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  const masterKey = crypto.randomBytes(32).toString('base64');

  console.log('Generated Master Key (base64):');
  console.log('───────────────────────────────────────────────────────');
  console.log(masterKey);
  console.log('───────────────────────────────────────────────────────\n');

  console.log('IMPORTANT SECURITY NOTES:');
  console.log('1. Store this key securely (AWS Secrets Manager, Vault, etc.)');
  console.log('2. Never commit this key to version control');
  console.log('3. Set as environment variable: MASTER_ENCRYPTION_KEY');
  console.log('4. Rotate this key annually or if compromised');
  console.log('5. Keep a secure backup of this key\n');

  console.log('To set in environment:');
  console.log(`export MASTER_ENCRYPTION_KEY="${masterKey}"\n`);

  console.log('To set in .env file:');
  console.log(`MASTER_ENCRYPTION_KEY=${masterKey}\n`);
}

main();
