/**
 * Database Seeding Script
 *
 * Seeds the database with test data for development and testing purposes.
 *
 * Usage:
 *   npm run db:seed
 *   npm run db:seed -- --env=test
 *   npm run db:seed -- --clear
 */

import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

interface SeedOptions {
  clear?: boolean;
  env?: 'development' | 'test';
}

/**
 * Parse command line arguments
 */
function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const options: SeedOptions = {
    env: 'development',
  };

  args.forEach((arg) => {
    if (arg === '--clear') {
      options.clear = true;
    }
    if (arg.startsWith('--env=')) {
      options.env = arg.split('=')[1] as 'development' | 'test';
    }
  });

  return options;
}

/**
 * Get Supabase client
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for seeding');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Clear existing seed data
 */
async function clearData(supabase: ReturnType<typeof createClient>) {
  console.log('🧹 Clearing existing seed data...');

  // Clear user_encryption_keys (cascades will handle related data)
  const { error: keysError } = await supabase
    .from('user_encryption_keys')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (keysError) {
    console.warn('Warning clearing encryption keys:', keysError.message);
  }

  console.log('✅ Data cleared');
}

/**
 * Seed test users with encryption keys
 */
async function seedTestUsers(supabase: ReturnType<typeof createClient>) {
  console.log('👥 Seeding test users...');

  // Note: In a real scenario, you would create users via Supabase Auth
  // For this seed script, we're assuming users exist or will be created separately
  // We'll create sample encryption keys for demonstration

  const testUserIds = [
    '550e8400-e29b-41d4-a716-446655440000',
    '550e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440002',
  ];

  const masterKey = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKey) {
    console.warn('⚠️  MASTER_ENCRYPTION_KEY not set, skipping encryption key seeding');
    return;
  }

  // Generate mock encrypted DEKs for test users
  const encryptionKeys = testUserIds.map((userId, index) => ({
    user_id: userId,
    encrypted_dek: crypto.randomBytes(64), // Mock encrypted DEK (IV + Ciphertext + AuthTag)
    key_version: 1,
  }));

  // Insert encryption keys
  const { data, error } = await supabase
    .from('user_encryption_keys')
    .upsert(encryptionKeys, {
      onConflict: 'user_id,key_version',
    })
    .select();

  if (error) {
    console.error('❌ Error seeding encryption keys:', error);
    throw error;
  }

  console.log(`✅ Seeded ${data?.length || 0} encryption keys`);
}

/**
 * Seed development data
 */
async function seedDevelopmentData(supabase: ReturnType<typeof createClient>) {
  console.log('🌱 Seeding development data...');

  await seedTestUsers(supabase);

  // Add more seed functions here as needed
  // await seedCampaigns(supabase);
  // await seedWallets(supabase);
  // await seedTokens(supabase);

  console.log('✅ Development data seeded');
}

/**
 * Seed test data (minimal, for automated tests)
 */
async function seedTestData(supabase: ReturnType<typeof createClient>) {
  console.log('🧪 Seeding test data...');

  await seedTestUsers(supabase);

  console.log('✅ Test data seeded');
}

/**
 * Main seeding function
 */
async function main() {
  const options = parseArgs();

  console.log('🚀 Database Seeding');
  console.log('Environment:', options.env);
  console.log('Clear existing data:', options.clear || false);
  console.log('---');

  try {
    const supabase = getSupabaseClient();

    if (options.clear) {
      await clearData(supabase);
    }

    if (options.env === 'test') {
      await seedTestData(supabase);
    } else {
      await seedDevelopmentData(supabase);
    }

    console.log('---');
    console.log('✨ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('---');
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run the seeder
main();
