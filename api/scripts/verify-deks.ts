#!/usr/bin/env ts-node
/**
 * DEK Verification Script
 *
 * Verifies that all user DEKs can be successfully decrypted with the current KEK.
 * Use this after master key rotation to ensure all DEKs are accessible.
 *
 * Usage:
 *   npm run verify-deks
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { KeyRotationService } from '../src/services/key-rotation.service';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║         DEK VERIFICATION                              ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // Check environment
  if (!process.env.MASTER_ENCRYPTION_KEY) {
    console.error('❌ Error: MASTER_ENCRYPTION_KEY environment variable not set');
    process.exit(1);
  }

  console.log('✓ MASTER_ENCRYPTION_KEY is set\n');

  // Create NestJS application
  console.log('Initializing application...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const rotationService = app.get(KeyRotationService);

  try {
    console.log('Verifying all DEKs...\n');
    const startTime = Date.now();

    const results = await rotationService.verifyAllDEKs();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║         VERIFICATION COMPLETE                         ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log(`Total DEKs:      ${results.total}`);
    console.log(`✓ Valid:         ${results.successful}`);
    console.log(`✗ Invalid:       ${results.failed}`);
    console.log(`Duration:        ${duration}s\n`);

    if (results.failed > 0) {
      console.log('❌ VERIFICATION FAILED\n');
      console.log('The following users have invalid DEKs:');
      results.failedUserIds.forEach((userId) => {
        console.log(`   - ${userId}`);
      });
      console.log('\nPossible causes:');
      console.log('1. Wrong MASTER_ENCRYPTION_KEY in environment');
      console.log('2. Incomplete master key rotation');
      console.log('3. Database corruption\n');
      console.log('Action required:');
      console.log('- If master key rotation failed, consider rollback');
      console.log('- Check application logs for errors');
      console.log('- Contact affected users if issue persists\n');

      await app.close();
      process.exit(1);
    }

    console.log('✓ All DEKs verified successfully');
    console.log('  All users can decrypt their wallets\n');
  } catch (error) {
    console.error('\n❌ VERIFICATION ERROR:');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    console.error('\nUnable to complete verification.\n');
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
