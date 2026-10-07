import './setup'

/** Seed string that must never appear in logs or error responses (D7). */
export const REVIEW_SECRET = 'the espresso grinder roared all evening'

type FetchInit = { body?: string; headers?: Record<string, string> }

/** Replaces global fetch with a test double; returns a restore function. */
export function stubFetch(
  impl: (url: string, init?: FetchInit) => Promise<unknown>,
): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    return (await impl(url, (init ?? {}) as FetchInit)) as Response
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

/** Captures console.error output as strings (Error args → `Name: message`). */
export function captureErrors(): { messages: () => string[]; restore: () => void } {
  const captured: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    captured.push(
      args
        .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' '),
    )
  }
  return {
    messages: () => captured,
    restore: () => {
      console.error = original
    },
  }
}

/** Sets/deletes env vars for one test; `undefined` deletes the key. */
export function setEnv(vars: Record<string, string | undefined>): () => void {
  const saved: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

/** A Google-style place used to fabricate paginated search responses. */
export function googleBranch(id: string, name: string) {
  return {
    id,
    displayName: { text: name },
    formattedAddress: '43820 Fremont Blvd, Fremont, CA 94538',
    location: { latitude: 37.5256, longitude: -121.9865 },
    rating: 4.2,
    userRatingCount: 187,
    primaryTypeDisplayName: { text: 'Coffee shop' },
    types: ['cafe'],
  }
}
