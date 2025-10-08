#!/usr/bin/env ts-node
/**
 * Master Key Rotation Script
 *
 * This script rotates the master encryption key by:
 * 1. Validating the new master key
 * 2. Re-encrypting all user DEKs with the new KEK
 * 3. Providing progress updates and error handling
 *
 * Usage:
 *   npm run rotate-master-key <new-master-key-base64>
 *
 * Example:
 *   npm run rotate-master-key "abc123...xyz" --batch-size=20
 *
 * IMPORTANT:
 * - Backup your database before running this script
 * - Ensure MASTER_ENCRYPTION_KEY is set to the OLD key
 * - After successful rotation, update MASTER_ENCRYPTION_KEY to the new key
 * - Perform a rolling restart of all services
 */

import * as crypto from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { KeyRotationService } from '../src/services/key-rotation.service';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Master Key Rotation Script
===========================

Usage:
  npm run rotate-master-key <new-master-key-base64> [options]

Arguments:
  <new-master-key-base64>  New master key (32 bytes, base64 encoded)

Options:
  --batch-size=<n>         Number of users to process per batch (default: 10)
  --dry-run                Validate setup without making changes
  --help                   Show this help message

Example:
  # Generate new master key
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

  # Run rotation
  npm run rotate-master-key "your-new-key-here" --batch-size=20

IMPORTANT STEPS:
1. Backup your database
2. Ensure MASTER_ENCRYPTION_KEY environment variable is set to OLD key
3. Run this script with the NEW key as argument
4. After successful rotation, update MASTER_ENCRYPTION_KEY to NEW key
5. Perform rolling restart of all services
6. Verify all services are working with: npm run verify-deks
`);
    process.exit(0);
  }

  // Parse arguments
  let newMasterKey = args[0];
  let batchSize = 10;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (!arg.startsWith('--') && arg !== newMasterKey) {
      newMasterKey = arg;
    }
  }

  if (!newMasterKey || newMasterKey.startsWith('--')) {
    console.error('Error: New master key is required');
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║         MASTER KEY ROTATION                           ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  console.log(`Batch size: ${batchSize}`);
  console.log(`Dry run: ${dryRun ? 'YES (no changes will be made)' : 'NO'}\n`);

  // Validate environment
  if (!process.env.MASTER_ENCRYPTION_KEY) {
    console.error('❌ Error: MASTER_ENCRYPTION_KEY environment variable not set');
    console.error('   This should be set to the OLD (current) master key');
    process.exit(1);
  }

  // Validate new master key format
  try {
    const keyBuffer = Buffer.from(newMasterKey, 'base64');
    if (keyBuffer.length !== 32) {
      throw new Error(`Key must be 32 bytes, got ${keyBuffer.length}`);
    }
    console.log('✓ New master key format is valid\n');
  } catch (error) {
    console.error('❌ Error: Invalid master key format');
    console.error(`   ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }

  // Check if new key is same as old key
  const oldKey = process.env.MASTER_ENCRYPTION_KEY;
  if (oldKey === newMasterKey) {
    console.error('❌ Error: New master key is the same as the current master key');
    console.error('   Please generate a different key');
    process.exit(1);
  }

  if (dryRun) {
    console.log('✓ Dry run validation passed');
    console.log('  Run without --dry-run to perform actual rotation\n');
    process.exit(0);
  }

  // Confirm with user
  console.log('⚠️  WARNING: This will re-encrypt all user DEKs');
  console.log('   Make sure you have:');
  console.log('   1. Created a database backup');
  console.log('   2. Set MASTER_ENCRYPTION_KEY to the OLD key');
  console.log('   3. Tested the new key format\n');

  // Create NestJS application
  console.log('Initializing application...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const rotationService = app.get(KeyRotationService);

  try {
    // Check if rotation is already in progress
    if (rotationService.isRotationInProgress()) {
      console.error('❌ Error: Key rotation already in progress');
      console.error('   Please wait for it to complete or restart the service');
      await app.close();
      process.exit(1);
    }

    console.log('Starting master key rotation...\n');
    const startTime = Date.now();

    // Perform rotation
    const progress = await rotationService.rotateMasterKey(
      newMasterKey,
      batchSize,
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║         ROTATION COMPLETE                             ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log(`Total users:     ${progress.total}`);
    console.log(`✓ Successful:    ${progress.completed}`);
    console.log(`✗ Failed:        ${progress.failed}`);
    console.log(`Duration:        ${duration}s\n`);

    if (progress.failed > 0) {
      console.log('⚠️  Some DEKs failed to rotate:');
      progress.failedUserIds.forEach((userId) => {
        console.log(`   - ${userId}`);
      });
      console.log('\n   These users will not be able to decrypt their wallets.');
      console.log('   You may need to rollback or manually fix these users.\n');
    }

    console.log('NEXT STEPS:');
    console.log('1. Update MASTER_ENCRYPTION_KEY environment variable to the NEW key');
    console.log('2. Perform a rolling restart of all services');
    console.log('3. Verify all services can decrypt DEKs:');
    console.log('   npm run verify-deks');
    console.log('4. Monitor logs for any decryption errors\n');

    if (progress.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ ROTATION FAILED:');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    console.error('\nThe database may be in an inconsistent state.');
    console.error('DO NOT update MASTER_ENCRYPTION_KEY until this is resolved.\n');
    await app.close();
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
