import { NextResponse, type NextRequest } from 'next/server'
import { isStoreConfigured, listFeedback, submitFeedback } from '@/lib/data/store'
import type { FeedbackCreatedResponse, FeedbackListResponse, SensoryFactorKey } from '@/lib/types'

/**
 * GET/POST /api/feedback — the visitor's OWN sensory notes about a place
 * (app-owned data, Phase 3 / docs/DATA_POLICY.md D8). First-party
 * submissions only: `consent: true` is mandatory, Google review content is
 * never accepted or stored here. Without Supabase credentials: 503
 * `code: "db_not_configured"`.
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const PLACE_ID_RE = /^[\w-]{1,128}$/
const FACTORS: SensoryFactorKey[] = ['noise', 'lighting', 'crowding', 'smell', 'seating', 'intensity']
const MAX_NOTE_LENGTH = 1000

const notConfigured = () =>
  NextResponse.json({ error: 'Database not configured', code: 'db_not_configured' }, { status: 503, headers: NO_STORE })
const badRequest = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE })
const serverError = (message: string, error: Error | unknown) => {
  console.error(`[sensemap] ${message}:`, error instanceof Error ? error.message : 'unknown error')
  return NextResponse.json({ error: 'Request failed' }, { status: 502, headers: NO_STORE })
}

export async function GET(req: NextRequest) {
  const placeId = (req.nextUrl.searchParams.get('placeId') ?? '').trim()
  if (!PLACE_ID_RE.test(placeId)) return badRequest('Invalid or missing placeId')
  if (!isStoreConfigured()) return notConfigured()

  try {
    const feedback = await listFeedback(placeId)
    const body: FeedbackListResponse = { feedback: feedback ?? [] }
    return NextResponse.json(body, { headers: NO_STORE })
  } catch (error) {
    return serverError('/api/feedback GET failed', error)
  }
}

export async function POST(req: NextRequest) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }
  const body = payload as { placeId?: unknown; factor?: unknown; note?: unknown; visitTime?: unknown; consent?: unknown }
  const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : ''
  const factor = typeof body.factor === 'string' ? body.factor : ''
  const note = typeof body.note === 'string' ? body.note : body.note == null ? '' : null
  const visitTime = typeof body.visitTime === 'string' && body.visitTime.trim() ? body.visitTime.trim() : null

  if (!PLACE_ID_RE.test(placeId)) return badRequest('Invalid or missing placeId')
  if (!FACTORS.includes(factor as SensoryFactorKey)) return badRequest('Invalid factor')
  if (note === null) return badRequest('Invalid note')
  if (note.length > MAX_NOTE_LENGTH) return badRequest(`Note must be at most ${MAX_NOTE_LENGTH} characters`)
  if (visitTime && Number.isNaN(Date.parse(visitTime))) return badRequest('Invalid visitTime')
  if (body.consent !== true) return badRequest('Consent is required to store a note')
  if (!isStoreConfigured()) return notConfigured()

  try {
    const feedback = await submitFeedback({ placeId, factor: factor as SensoryFactorKey, note, visitTime })
    if (!feedback) return notConfigured()
    const responseBody: FeedbackCreatedResponse = { feedback }
    return NextResponse.json(responseBody, { status: 201, headers: NO_STORE })
  } catch (error) {
    return serverError('/api/feedback POST failed', error)
  }
}
