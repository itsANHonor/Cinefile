import fs from 'fs';
import knex from 'knex';
import path from 'path';

const databasePath = path.resolve(process.env.DATABASE_PATH || './database.sqlite');
const migrationsDir = process.env.MIGRATIONS_DIR || path.join(__dirname, '../migrations');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = knex({
  client: 'better-sqlite3',
  connection: {
    filename: databasePath,
  },
  useNullAsDefault: true,
  migrations: {
    directory: migrationsDir,
    extension: 'js',
    loadExtensions: ['.js'],
  },
});

export async function setupDatabase() {
  try {
    // Enable foreign keys before running migrations (as a backup)
    await db.raw('PRAGMA foreign_keys = ON');

    // Create a pre-migration backup when pending migrations exist on a non-empty database
    if (fs.existsSync(databasePath) && fs.statSync(databasePath).size > 0) {
      try {
        const [, pending] = await db.migrate.list();
        if (Array.isArray(pending) && pending.length > 0) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = `${databasePath}.backup.${timestamp}`;
          fs.copyFileSync(databasePath, backupPath);
          console.log(`💾 Created pre-migration database backup: ${path.basename(backupPath)}`);
        }
      } catch (backupError) {
        console.warn('⚠️  Could not check or create pre-migration backup:', backupError);
      }
    }

    // Run any pending migrations
    await db.migrate.latest();
    console.log('✅ Database migrations completed');
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}
