// scripts/check-admin.ts
import postgres from 'postgres'

const postgresPassword = process.env.POSTGRES_PASSWORD
if (!postgresPassword) {
  console.error('Error: POSTGRES_PASSWORD is required')
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

async function check() {
  try {
    const roles = await sql`SELECT * FROM indonesian.user_roles`
    console.log('User roles:', roles)
    
    if (roles.length === 0) {
      const users = await sql`SELECT id, email FROM auth.users`
      console.log('Available users:', users)
    }
  } catch (err) {
    console.error('Check failed:', err)
  } finally {
    await sql.end()
  }
}

check()
