// scripts/migrate.ts
// Run with: bun scripts/migrate.ts
// Then execute scripts/migration.sql via psql or Supabase dashboard SQL editor

console.log('Read migration SQL from scripts/migration.sql')

const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD

if (!DB_PASSWORD) {
  console.log('')
  console.log('To apply the migration, run: make migrate SUPABASE_DB_PASSWORD=<postgres-password>')
  console.log('Or paste scripts/migration.sql into Supabase Studio > SQL Editor > Run')
  process.exit(0)
}

const HOMELAB_SSH = process.env.HOMELAB_SSH ?? 'mrblond@192.168.2.51'
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase-db'

console.log(`\nApplying migration via ${HOMELAB_SSH} → docker exec ${DB_CONTAINER}...`)

const migrationSql = await Bun.file('scripts/migration.sql').text()

const proc = Bun.spawn(
  [
    'ssh', '-i', `${process.env.HOME}/.ssh/id_ed25519`, '-o', 'StrictHostKeyChecking=no',
    HOMELAB_SSH,
    `PGPASSWORD=${DB_PASSWORD} sudo docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1`,
  ],
  { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }
)

proc.stdin.write(migrationSql)
proc.stdin.end()

const [exitCode, stdout, stderr] = await Promise.all([
  proc.exited,
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
])

if (stdout) console.log(stdout)
if (exitCode !== 0) {
  console.error(stderr)
  console.error('\nMigration failed.')
  process.exit(1)
}
console.log('Migration applied successfully.')

// Reload PostgREST schema cache so new tables/functions are immediately available
console.log('Reloading PostgREST schema cache...')
const notify = Bun.spawn(
  [
    'ssh', '-i', `${process.env.HOME}/.ssh/id_ed25519`, '-o', 'StrictHostKeyChecking=no',
    HOMELAB_SSH,
    `PGPASSWORD=${DB_PASSWORD} sudo docker exec ${DB_CONTAINER} psql -U postgres -c "NOTIFY pgrst, 'reload schema';"`,
  ],
  { stdout: 'pipe', stderr: 'pipe' }
)
await notify.exited
console.log('Done.')
