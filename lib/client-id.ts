/**
 * Anonymous, device-local user id — SenseMap has no accounts yet, so saved
 * places are keyed by a UUID generated in the browser and stored in
 * localStorage. Client-only; never called during server rendering.
 */
const STORAGE_KEY = 'sensemap-user-id'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function getUserId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing && UUID_RE.test(existing)) return existing
    const id = crypto.randomUUID()
    window.localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    // Storage unavailable (private mode): ephemeral id for this session.
    try {
      return crypto.randomUUID()
    } catch {
      return ''
    }
  }
}
