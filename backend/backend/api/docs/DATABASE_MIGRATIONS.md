# Database Migrations Guide

This guide covers the database migration system for the Solana Volume Bot API, including how to create, run, and rollback migrations.

## Overview

The project uses [node-pg-migrate](https://github.com/salsita/node-pg-migrate) for managing PostgreSQL database schema changes. This tool provides:

- **Version Control**: Track all schema changes with timestamps
- **Rollback Support**: Safely revert migrations if needed
- **TypeScript Support**: Write migrations in TypeScript with full type safety
- **Programmatic API**: Run migrations from code or CLI
- **Transaction Safety**: Each migration runs in a transaction (configurable)

## Table of Contents

- [Setup](#setup)
- [Configuration](#configuration)
- [Creating Migrations](#creating-migrations)
- [Running Migrations](#running-migrations)
- [Rolling Back Migrations](#rolling-back-migrations)
- [Seeding Data](#seeding-data)
- [Testing Migrations](#testing-migrations)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Setup

### Prerequisites

Ensure the following environment variables are set:

```bash
DATABASE_URL=postgresql://user:password@host:port/database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Installation

The migration dependencies are already installed:

```bash
npm install  # node-pg-migrate is in devDependencies
```

## Configuration

Migration configuration is stored in `.node-pg-migrate.config.json`:

```json
{
  "databaseUrl": {
    "env": "DATABASE_URL"
  },
  "migrationsTable": "pgmigrations",
  "dir": "migrations",
  "direction": "up",
  "count": "Infinity",
  "schema": "public",
  "createSchema": false,
  "createMigrationsSchema": false,
  "checkOrder": true,
  "verbose": true,
  "migrationFileLanguage": "ts",
  "decamelize": false,
  "ignorePattern": "\\..*"
}
```

## Creating Migrations

### Using the CLI

Create a new migration:

```bash
npm run migrate:create my-migration-name
```

This creates a new TypeScript file in `migrations/` with the format:
`{timestamp}_{name}.ts`

### Migration File Structure

```typescript
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Define schema changes to apply
  pgm.createTable('my_table', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: { type: 'varchar(255)', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Define how to revert the changes
  pgm.dropTable('my_table', { ifExists: true });
}
```

### Common Operations

#### Creating Tables

```typescript
pgm.createTable('users', {
  id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
  email: { type: 'varchar(255)', notNull: true, unique: true },
  created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
});
```

#### Adding Columns

```typescript
pgm.addColumns('users', {
  last_login: { type: 'timestamptz' },
  login_count: { type: 'integer', default: 0 },
});
```

#### Creating Indexes

```typescript
pgm.createIndex('users', 'email', { unique: true });
pgm.createIndex('posts', ['user_id', 'created_at']);
```

#### Adding Foreign Keys

```typescript
pgm.addConstraint('posts', 'posts_user_id_fkey', {
  foreignKeys: {
    columns: 'user_id',
    references: 'users(id)',
    onDelete: 'CASCADE',
  },
});
```

#### Running Raw SQL

```typescript
pgm.sql(`
  CREATE OR REPLACE FUNCTION update_timestamp()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
`);
```

## Running Migrations

### CLI Commands

```bash
# Run all pending migrations
npm run migrate:up

# Check migration status
npm run migrate:status

# Run specific number of migrations
npm run migrate:up -- --count 1

# Dry run (preview SQL without executing)
npm run migrate:up -- --dry-run
```

### Programmatic Usage

```typescript
import { MigrationService } from './services/migration.service';

const migrationService = new MigrationService();

// Run all pending migrations
const results = await migrationService.up();
console.log('Applied migrations:', results);

// Run with options
await migrationService.up({
  count: 1,
  dryRun: false,
});
```

## Rolling Back Migrations

### CLI Commands

```bash
# Rollback last migration
npm run migrate:down

# Rollback specific number of migrations
npm run migrate:down -- --count 2

# Redo last migration (down then up)
npm run migrate:redo
```

### Programmatic Usage

```typescript
// Rollback last migration
const results = await migrationService.down({ count: 1 });

// Redo last migration
const redoResults = await migrationService.redo({ count: 1 });
console.log('Rolled back:', redoResults.down);
console.log('Re-applied:', redoResults.up);
```

## Seeding Data

### Running Seeds

```bash
# Seed development data
npm run db:seed

# Seed test data
npm run db:seed -- --env=test

# Clear and reseed
npm run db:seed -- --clear
```

### Creating Custom Seed Scripts

Edit `scripts/seed.ts` to add custom seeding functions:

```typescript
async function seedCustomData(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('my_table')
    .insert([
      { name: 'Item 1' },
      { name: 'Item 2' },
    ])
    .select();

  if (error) throw error;
  console.log(`✅ Seeded ${data.length} items`);
}
```

## Testing Migrations

### Running Tests

```bash
# Run migration tests
npm test migration.service.spec.ts

# Run with coverage
npm run test:coverage -- migration.service.spec.ts
```

### Test Structure

Migration tests verify:

1. ✅ Migrations run successfully
2. ✅ Tables are created with correct schema
3. ✅ Indexes and constraints are applied
4. ✅ Rollbacks work correctly
5. ✅ Data integrity is maintained

Example test:

```typescript
it('should create user_encryption_keys table', async () => {
  await migrationService.up();

  const { error } = await supabase
    .from('user_encryption_keys')
    .select('*')
    .limit(1);

  expect(error).toBeNull();
});
```

## Best Practices

### 1. Always Write Down Migrations

Every `up` migration should have a corresponding `down` migration:

```typescript
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('users', { /* ... */ });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('users', { ifExists: true });
}
```

### 2. Use Transactions

By default, migrations run in transactions. For operations that can't run in transactions (like creating enum values), disable it:

```typescript
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction();
  pgm.addTypeValue('my_enum', 'new_value');
}
```

### 3. Test Before Deploying

```bash
# Test migration on a copy of production data
npm run migrate:up -- --dry-run

# Apply and verify
npm run migrate:up
npm test

# If issues, rollback
npm run migrate:down
```

### 4. Never Modify Existing Migrations

Once a migration is deployed to production, create a new migration instead of modifying the existing one.

### 5. Use Descriptive Names

```bash
# Good
npm run migrate:create add-user-email-index
npm run migrate:create create-campaigns-table

# Bad
npm run migrate:create update
npm run migrate:create fix
```

### 6. Keep Migrations Small

Split large changes into multiple migrations for easier rollback and debugging.

## Troubleshooting

### Migration Fails Midway

```bash
# Check which migrations are applied
npm run migrate:status

# Manually fix the issue in the database, then
npm run migrate:up
```

### Out of Order Migrations

node-pg-migrate checks migration order by default. If you need to skip this:

```json
{
  "checkOrder": false
}
```

### Connection Issues

```bash
# Verify DATABASE_URL is set
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Rollback Fails

If a rollback fails, you may need to manually fix the database:

1. Connect to the database
2. Review the migration's `down` function
3. Manually execute the SQL
4. Update the `pgmigrations` table:

```sql
DELETE FROM pgmigrations WHERE name = 'failing_migration_name';
```

## Migration Tracking

Migrations are tracked in the `pgmigrations` table:

```sql
SELECT * FROM pgmigrations ORDER BY run_on DESC;
```

| Column     | Type      | Description                    |
| ---------- | --------- | ------------------------------ |
| id         | SERIAL    | Auto-incrementing ID           |
| name       | VARCHAR   | Migration file name            |
| run_on     | TIMESTAMP | When the migration was applied |

## Advanced Topics

### Multiple Database Environments

Use different `DATABASE_URL` values for each environment:

```bash
# Development
DATABASE_URL=postgresql://localhost/dev_db npm run migrate:up

# Staging
DATABASE_URL=postgresql://staging-host/staging_db npm run migrate:up

# Production (use with caution!)
DATABASE_URL=postgresql://prod-host/prod_db npm run migrate:up
```

### Custom Migration Configuration

Override config per command:

```bash
npm run migrate -- up \
  --database-url-var DATABASE_URL \
  --migrations-dir custom/migrations \
  --migrations-table custom_migrations
```

## Further Reading

- [node-pg-migrate Documentation](https://salsita.github.io/node-pg-migrate/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Supabase Database Guide](https://supabase.com/docs/guides/database)

---

**Need Help?** Check the [troubleshooting section](#troubleshooting) or consult the team.
