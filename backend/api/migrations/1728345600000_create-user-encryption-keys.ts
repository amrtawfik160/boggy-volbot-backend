/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Migration: Create user_encryption_keys table
 * Description: Store per-user Data Encryption Keys (DEKs) encrypted with the KEK
 * Date: 2025-10-07
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create user_encryption_keys table
  pgm.createTable('user_encryption_keys', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'auth.users(id)',
      onDelete: 'CASCADE',
    },
    encrypted_dek: {
      type: 'bytea',
      notNull: true,
      comment: 'DEK encrypted with KEK using AES-256-GCM [IV(16) + Ciphertext(32) + AuthTag(16)]',
    },
    key_version: {
      type: 'integer',
      notNull: true,
      default: 1,
      comment: 'Key version for rotation tracking, higher version = newer key',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add unique constraint
  pgm.addConstraint('user_encryption_keys', 'user_encryption_keys_user_id_key_version_key', {
    unique: ['user_id', 'key_version'],
  });

  // Create indexes for efficient lookups
  pgm.createIndex('user_encryption_keys', 'user_id', {
    name: 'idx_user_encryption_keys_user_id',
  });

  pgm.createIndex('user_encryption_keys', ['user_id', 'key_version'], {
    name: 'idx_user_encryption_keys_user_version',
    method: 'btree',
  });

  // Enable Row Level Security
  pgm.sql('ALTER TABLE user_encryption_keys ENABLE ROW LEVEL SECURITY;');

  // Create RLS policies
  pgm.sql(`
    CREATE POLICY user_encryption_keys_select_policy
      ON user_encryption_keys
      FOR SELECT
      USING (auth.uid() = user_id);
  `);

  pgm.sql(`
    CREATE POLICY user_encryption_keys_insert_policy
      ON user_encryption_keys
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  `);

  pgm.sql(`
    CREATE POLICY user_encryption_keys_update_policy
      ON user_encryption_keys
      FOR UPDATE
      USING (auth.uid() = user_id);
  `);

  pgm.sql(`
    CREATE POLICY user_encryption_keys_delete_policy
      ON user_encryption_keys
      FOR DELETE
      USING (auth.uid() = user_id);
  `);

  // Create updated_at trigger function
  pgm.createFunction(
    'update_updated_at_column',
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
      replace: true,
    },
    `
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
`,
  );

  // Add trigger
  pgm.createTrigger('user_encryption_keys', 'update_user_encryption_keys_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Add table comment
  pgm.sql(`
    COMMENT ON TABLE user_encryption_keys IS 'Stores per-user Data Encryption Keys (DEKs) encrypted with the Key Encryption Key (KEK)';
  `);
}

/**
 * Rollback migration
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop trigger
  pgm.dropTrigger('user_encryption_keys', 'update_user_encryption_keys_updated_at', {
    ifExists: true,
  });

  // Drop function
  pgm.dropFunction('update_updated_at_column', [], {
    ifExists: true,
    cascade: true,
  });

  // Drop RLS policies (will be automatically dropped with table, but explicit for clarity)
  pgm.sql('DROP POLICY IF EXISTS user_encryption_keys_delete_policy ON user_encryption_keys;');
  pgm.sql('DROP POLICY IF EXISTS user_encryption_keys_update_policy ON user_encryption_keys;');
  pgm.sql('DROP POLICY IF EXISTS user_encryption_keys_insert_policy ON user_encryption_keys;');
  pgm.sql('DROP POLICY IF EXISTS user_encryption_keys_select_policy ON user_encryption_keys;');

  // Drop table (cascade will drop indexes, constraints, etc.)
  pgm.dropTable('user_encryption_keys', { ifExists: true, cascade: true });
}
