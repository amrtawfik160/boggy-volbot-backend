import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MigrationService } from '../migration.service';
import { createClient } from '@supabase/supabase-js';

describe('MigrationService', () => {
  let migrationService: MigrationService;
  let supabase: ReturnType<typeof createClient>;

  beforeAll(() => {
    // Ensure DATABASE_URL is set for tests
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set for migration tests');
    }

    const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    migrationService = new MigrationService();
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('constructor', () => {
    it('should throw error if DATABASE_URL is not set', () => {
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      expect(() => new MigrationService()).toThrow(
        'DATABASE_URL environment variable is not set',
      );

      process.env.DATABASE_URL = originalUrl;
    });

    it('should initialize with correct configuration', () => {
      expect(migrationService).toBeDefined();
      expect(migrationService).toBeInstanceOf(MigrationService);
    });
  });

  describe('up', () => {
    it('should run pending migrations', async () => {
      const results = await migrationService.up();

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should support dry run mode', async () => {
      const results = await migrationService.up({ dryRun: true });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should run specific number of migrations', async () => {
      const results = await migrationService.up({ count: 1 });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('down', () => {
    it('should rollback last migration', async () => {
      // First ensure we have migrations to rollback
      await migrationService.up({ count: 1 });

      const results = await migrationService.down({ count: 1 });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should support dry run mode for rollback', async () => {
      const results = await migrationService.down({ count: 1, dryRun: true });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('redo', () => {
    it('should redo last migration', async () => {
      // Ensure we have a migration to redo
      await migrationService.up({ count: 1 });

      const results = await migrationService.redo({ count: 1 });

      expect(results).toBeDefined();
      expect(results.down).toBeDefined();
      expect(results.up).toBeDefined();
      expect(Array.isArray(results.down)).toBe(true);
      expect(Array.isArray(results.up)).toBe(true);
    });
  });

  describe('status', () => {
    it('should return migration status', async () => {
      const status = await migrationService.status();

      expect(status).toBeDefined();
      expect(status.pending).toBeDefined();
      expect(status.applied).toBeDefined();
      expect(Array.isArray(status.pending)).toBe(true);
      expect(Array.isArray(status.applied)).toBe(true);
    });
  });

  describe('integration with database', () => {
    it('should create pgmigrations table after first migration', async () => {
      await migrationService.up({ count: 1 });

      // Query the pgmigrations table
      const { data, error } = await supabase.from('pgmigrations').select('*').limit(1);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it('should track applied migrations in pgmigrations table', async () => {
      await migrationService.up();

      const { data, error } = await supabase.from('pgmigrations').select('*');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBeGreaterThan(0);
    });

    it('should create user_encryption_keys table', async () => {
      await migrationService.up();

      // Verify table exists by querying it
      const { error } = await supabase.from('user_encryption_keys').select('*').limit(1);

      expect(error).toBeNull();
    });

    it('should enforce unique constraint on user_id and key_version', async () => {
      await migrationService.up();

      const testUserId = '550e8400-e29b-41d4-a716-446655440099';
      const encryptedDek = Buffer.from('test_encrypted_dek');

      // Insert first key
      const { error: firstError } = await supabase.from('user_encryption_keys').insert({
        user_id: testUserId,
        encrypted_dek: encryptedDek,
        key_version: 1,
      });

      expect(firstError).toBeNull();

      // Try to insert duplicate (same user_id and key_version)
      const { error: duplicateError } = await supabase.from('user_encryption_keys').insert({
        user_id: testUserId,
        encrypted_dek: encryptedDek,
        key_version: 1,
      });

      expect(duplicateError).not.toBeNull();
      expect(duplicateError?.message).toContain('unique');

      // Cleanup
      await supabase.from('user_encryption_keys').delete().eq('user_id', testUserId);
    });
  });
});
