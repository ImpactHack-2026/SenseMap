import { NextResponse, type NextRequest } from 'next/server'
import { PAGE_SIZE, searchPlaces } from '@/lib/data/google-places'
import { searchSerpPlaces } from '@/lib/data/serpapi'
import { recordPlacesSeen } from '@/lib/data/store'
import { DEMO_RESTAURANTS } from '@/lib/data/demo-restaurants'
import { placeMatchesQuery } from '@/lib/sensory'
import type { PlacesSearchResponse } from '@/lib/types'

/**
 * GET /api/places/search?q=…&pageToken=…
 *
 * Server-side search over live Google Maps content: the official Places
 * (new v1) API when `GOOGLE_PLACES_API_KEY` is set, otherwise the SerpAPI
 * transport when `SERPAPI_KEY` is set (same attribution, quota-limited —
 * failures degrade to the demo dataset rather than 502), otherwise the fixed
 * demo dataset so the app keeps working keyless. Keys stay server-side and
 * responses are never cached (docs/DATA_POLICY.md D2/D3).
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_PAGE_TOKEN_LENGTH = 512

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const pageToken = (req.nextUrl.searchParams.get('pageToken') ?? '').trim()

  if (!query) {
    return NextResponse.json({ error: 'Missing required query parameter: q' }, { status: 400 })
  }
  if (pageToken.length > MAX_PAGE_TOKEN_LENGTH) {
    return NextResponse.json({ error: 'Invalid pageToken' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (apiKey) {
    try {
      const { places, nextPageToken } = await searchPlaces({ apiKey, query, pageToken: pageToken || undefined })
      // Phase 3: remember the Place IDs we served (IDs + timestamps only).
      await recordPlacesSeen(places.map((p) => p.placeId))
      const body: PlacesSearchResponse = { source: 'google', query, pageSize: PAGE_SIZE, places, nextPageToken }
      return NextResponse.json(body, { headers: NO_STORE })
    } catch (error) {
      // Fixed message only — upstream details (or the key) never reach logs or clients.
      console.error('[sensemap] /api/places/search failed:', error)
      return NextResponse.json({ error: 'Google Places search failed' }, { status: 502, headers: NO_STORE })
    }
  }

  const serpKey = process.env.SERPAPI_KEY
  if (serpKey) {
    try {
      const { places, nextPageToken } = await searchSerpPlaces({ apiKey: serpKey, query, pageToken: pageToken || undefined })
      await recordPlacesSeen(places.map((p) => p.placeId))
      const body: PlacesSearchResponse = { source: 'google', query, pageSize: PAGE_SIZE, places, nextPageToken }
      return NextResponse.json(body, { headers: NO_STORE })
    } catch (error) {
      // SerpAPI is the quota-limited channel (free tier ≈100 searches/month),
      // so exhaustion is expected: log a status-only message and degrade to
      // the labeled demo dataset instead of failing the request.
      console.error('[sensemap] /api/places/search: SerpAPI unavailable, using demo data:', error instanceof Error ? error.message : 'unknown error')
    }
  }

  // Keyless/demo fallback: fixed fictional dataset, single page, no Google
  // content involved. Matches the same fields the Explore browse filters
  // search, so typing the same text gives the same results either mode.
  const body: PlacesSearchResponse = {
    source: 'demo',
    query,
    pageSize: PAGE_SIZE,
    places: DEMO_RESTAURANTS.map((r) => r.place).filter((p) => placeMatchesQuery(p, query)),
    nextPageToken: null,
  }
  return NextResponse.json(body, { headers: NO_STORE })
}
