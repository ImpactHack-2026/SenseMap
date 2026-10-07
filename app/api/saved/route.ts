import { NextResponse, type NextRequest } from 'next/server'
import { isStoreConfigured, listSavedPlaces, removePlace, savePlace } from '@/lib/data/store'
import type { RemovePlaceResponse, SavePlaceResponse, SavedPlacesResponse } from '@/lib/types'

/**
 * GET/POST/DELETE /api/saved — the user's saved Place IDs (app-owned data,
 * Phase 3 / docs/DATA_POLICY.md D8). Only the Place ID is stored; Google
 * details stay live-fetched. `userId` is an anonymous client-generated UUID
 * (no accounts in SenseMap yet). Without Supabase credentials the routes
 * answer 503 with `code: "db_not_configured"` so the UI can degrade.
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLACE_ID_RE = /^[\w-]{1,128}$/

const notConfigured = () =>
  NextResponse.json({ error: 'Database not configured', code: 'db_not_configured' }, { status: 503, headers: NO_STORE })
const badRequest = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE })
const serverError = (message: string, error: Error | unknown) => {
  console.error(`[sensemap] ${message}:`, error instanceof Error ? error.message : 'unknown error')
  return NextResponse.json({ error: 'Request failed' }, { status: 502, headers: NO_STORE })
}

export async function GET(req: NextRequest) {
  const userId = (req.nextUrl.searchParams.get('userId') ?? '').trim()
  if (!USER_ID_RE.test(userId)) return badRequest('Invalid or missing userId')
  if (!isStoreConfigured()) return notConfigured()

  try {
    const savedPlaces = await listSavedPlaces(userId)
    const body: SavedPlacesResponse = { savedPlaces: savedPlaces ?? [] }
    return NextResponse.json(body, { headers: NO_STORE })
  } catch (error) {
    return serverError('/api/saved GET failed', error)
  }
}

export async function POST(req: NextRequest) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }
  const body = payload as { userId?: unknown; placeId?: unknown }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : ''
  if (!USER_ID_RE.test(userId)) return badRequest('Invalid or missing userId')
  if (!PLACE_ID_RE.test(placeId)) return badRequest('Invalid or missing placeId')
  if (!isStoreConfigured()) return notConfigured()

  try {
    const result = await savePlace(userId, placeId)
    if (!result) return notConfigured()
    const responseBody: SavePlaceResponse = result
    return NextResponse.json(responseBody, { status: result.alreadySaved ? 200 : 201, headers: NO_STORE })
  } catch (error) {
    return serverError('/api/saved POST failed', error)
  }
}

export async function DELETE(req: NextRequest) {
  const userId = (req.nextUrl.searchParams.get('userId') ?? '').trim()
  const placeId = (req.nextUrl.searchParams.get('placeId') ?? '').trim()
  if (!USER_ID_RE.test(userId)) return badRequest('Invalid or missing userId')
  if (!PLACE_ID_RE.test(placeId)) return badRequest('Invalid or missing placeId')
  if (!isStoreConfigured()) return notConfigured()

  try {
    const removed = await removePlace(userId, placeId)
    if (removed === null) return notConfigured()
    const body: RemovePlaceResponse = { removed }
    return NextResponse.json(body, { headers: NO_STORE })
  } catch (error) {
    return serverError('/api/saved DELETE failed', error)
  }
}
