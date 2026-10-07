/**
 * Applies every SQL file in supabase/migrations/ in order.
 *
 * Usage:  SUPABASE_DB_URL=postgres://... node scripts/apply-migrations.mjs
 * (or:    pnpm db:migrate   after setting SUPABASE_DB_URL in .env.local)
 *
 * Each file runs in its own transaction: either it applies fully or it is
 * rolled back, so a failed migration never leaves half a schema behind.
 * The connection string never leaves the server/terminal environment.
 */
import { readdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import pg from 'pg'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL is not set (paste your Supabase connection string into .env.local).')
  process.exit(1)
}

const migrationsDir = new URL('../supabase/migrations/', import.meta.url)
const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

if (files.length === 0) {
  console.error('No migration files found in supabase/migrations/.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()

let applied = 0
let skipped = 0
for (const file of files) {
  const sql = await readFile(new URL(file, migrationsDir), 'utf8')
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('commit')
    applied++
    console.log(`applied  ${file}`)
  } catch (error) {
    await client.query('rollback').catch(() => {})
    // Duplicate-object errors mean the migration already ran (idempotent re-run).
    if (error && (error.code === '42710' || error.code === '42P07' || error.code === '42701')) {
      skipped++
      console.log(`skipped  ${file} (${error.code} — already applied)`)
      continue
    }
    console.error(`failed   ${file}: ${error?.message ?? error}`)
    await client.end().catch(() => {})
    process.exit(1)
  }
}

await client.end()
console.log(`done: ${applied} applied, ${skipped} skipped, ${files.length} total`)
