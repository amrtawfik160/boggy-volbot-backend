import runner from 'node-pg-migrate';
import { join } from 'path';

export interface MigrationOptions {
  direction?: 'up' | 'down';
  count?: number | 'max';
  dryRun?: boolean;
}

export interface MigrationResult {
  file: string;
  name: string;
  timestamp: number;
}

/**
 * Service for managing database migrations programmatically
 */
export class MigrationService {
  private readonly migrationsDir: string;
  private readonly databaseUrl: string;

  constructor() {
    this.migrationsDir = join(__dirname, '../../migrations');
    this.databaseUrl = this.getDatabaseUrl();
  }

  /**
   * Get database URL from environment
   */
  private getDatabaseUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Please configure your database connection.',
      );
    }
    return url;
  }

  /**
   * Run pending migrations
   */
  async up(options: MigrationOptions = {}): Promise<MigrationResult[]> {
    const { count = 'max', dryRun = false } = options;

    const migrations = await runner({
      databaseUrl: this.databaseUrl,
      dir: this.migrationsDir,
      direction: 'up',
      count: count === 'max' ? Infinity : count,
      migrationsTable: 'pgmigrations',
      checkOrder: true,
      verbose: true,
      dryRun,
      createSchema: false,
      createMigrationsSchema: false,
      decamelize: false,
      ignorePattern: '\\..*',
    });

    return migrations.map((m) => ({
      file: m.path,
      name: m.name,
      timestamp: m.timestamp,
    }));
  }

  /**
   * Rollback migrations
   */
  async down(options: MigrationOptions = {}): Promise<MigrationResult[]> {
    const { count = 1, dryRun = false } = options;

    const migrations = await runner({
      databaseUrl: this.databaseUrl,
      dir: this.migrationsDir,
      direction: 'down',
      count: typeof count === 'number' ? count : Infinity,
      migrationsTable: 'pgmigrations',
      checkOrder: true,
      verbose: true,
      dryRun,
      decamelize: false,
      ignorePattern: '\\..*',
    });

    return migrations.map((m) => ({
      file: m.path,
      name: m.name,
      timestamp: m.timestamp,
    }));
  }

  /**
   * Redo last migration (down then up)
   */
  async redo(options: MigrationOptions = {}): Promise<{
    down: MigrationResult[];
    up: MigrationResult[];
  }> {
    const { count = 1, dryRun = false } = options;

    // First rollback
    const downMigrations = await this.down({ count, dryRun });

    // Then run up again
    const upMigrations = await this.up({ count, dryRun });

    return {
      down: downMigrations,
      up: upMigrations,
    };
  }

  /**
   * Get migration status
   */
  async status(): Promise<{
    pending: string[];
    applied: Array<{ name: string; timestamp: number }>;
  }> {
    // This requires a custom query to the migrations table
    // For now, we'll return a basic structure
    return {
      pending: [],
      applied: [],
    };
  }
}
