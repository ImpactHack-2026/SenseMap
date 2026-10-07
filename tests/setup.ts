/**
 * Imported FIRST by every test file, before any app module loads:
 * - maps the `@/*` path alias to the compiled output in `.test-build/`
 *   (tsc does not rewrite path aliases);
 * - stubs `server-only`, which throws under plain Node because there is no
 *   `react-server` export condition outside a React server bundle.
 */
import Module from 'node:module'
import path from 'node:path'

const BUILD_ROOT = path.resolve(__dirname, '..')
const SERVER_ONLY_STUB = path.resolve(__dirname, '..', '..', 'scripts', 'stubs', 'server-only.js')

// Normalize the environment before any app module loads: tests must never
// depend on workspace secrets, and the data store must be in its documented
// keyless state (graceful no-op → 503 db_not_configured).
delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY
delete process.env.SUPABASE_DB_URL
delete process.env.GOOGLE_PLACES_API_KEY
delete process.env.SERPAPI_KEY

type ResolveFilename = (request: string, ...rest: unknown[]) => string

const hooks = Module as unknown as { _resolveFilename: ResolveFilename; __senseMapHooks?: boolean }
if (!hooks.__senseMapHooks) {
  const original = hooks._resolveFilename
  hooks._resolveFilename = function (request: string, ...rest: unknown[]): string {
    if (request === 'server-only') return SERVER_ONLY_STUB
    if (request.startsWith('@/')) return original.call(this, path.join(BUILD_ROOT, request.slice(2)), ...rest)
    return original.call(this, request, ...rest)
  }
  hooks.__senseMapHooks = true
}

export {}
