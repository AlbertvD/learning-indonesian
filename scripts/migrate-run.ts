// scripts/migrate-run.ts
import postgres from 'postgres'

const postgresPassword = process.env.POSTGRES_PASSWORD
if (!postgresPassword) {
  console.error('Error: POSTGRES_PASSWORD is required in .env.local')
  process.exit(1)
}

const sql = postgres({
  host: 'api.supabase.duin.home',
  port: 5432,
  database: 'postgres',
  username: 'postgres',
  password: postgresPassword,
  ssl: 'require',
})

async function run() {
  try {
    console.log('Running migration: adding language column to profiles...')
    await sql`
      ALTER TABLE indonesian.profiles
      ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'nl'
      CHECK (language IN ('nl', 'en'));
    `
    console.log('Migration successful!')
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

run()
