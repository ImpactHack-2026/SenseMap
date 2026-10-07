import { NextResponse, type NextRequest } from 'next/server'
import { fetchPlaceDetail } from '@/lib/data/google-places'
import { fetchSerpPlaceDetail } from '@/lib/data/serpapi'
import { recordPlacesSeen } from '@/lib/data/store'
import { DEMO_RESTAURANTS } from '@/lib/data/demo-restaurants'
import type { PlaceDetailResponse } from '@/lib/types'

/**
 * GET /api/places/[placeId]
 *
 * On-demand detail for a single place: live Google Maps content is fetched
 * (reviews included, because this is the screen that renders them), analyzed
 * server-side, and returned with the sensory profile. The official Places
 * API runs when `GOOGLE_PLACES_API_KEY` is set; otherwise the SerpAPI
 * transport (`SERPAPI_KEY`, quota-limited — failures degrade to demo data);
 * without either key the matching demo venue is returned, else 404. Never
 * cached (docs/DATA_POLICY.md D3); keys stay server-side.
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
/** Google place ids and demo slugs are alphanumeric with `_`/`-` only. */
const PLACE_ID_PATTERN = /^[\w-]{1,128}$/

export async function GET(_req: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params
  if (!PLACE_ID_PATTERN.test(placeId)) {
    return NextResponse.json({ error: 'Invalid placeId' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (apiKey) {
    try {
      const restaurant = await fetchPlaceDetail(placeId, apiKey)
      if (!restaurant) {
        return NextResponse.json({ error: 'Place not found' }, { status: 404, headers: NO_STORE })
      }
      // Phase 3: remember the Place ID we served (IDs + timestamps only).
      await recordPlacesSeen([restaurant.place.placeId])
      const body: PlaceDetailResponse = { source: 'google', restaurant }
      return NextResponse.json(body, { headers: NO_STORE })
    } catch (error) {
      // Fixed message only — upstream details (or the key) never reach logs or clients.
      console.error('[sensemap] /api/places/[placeId] failed:', error)
      return NextResponse.json({ error: 'Google Place Details failed' }, { status: 502, headers: NO_STORE })
    }
  }

  const serpKey = process.env.SERPAPI_KEY
  if (serpKey) {
    try {
      const restaurant = await fetchSerpPlaceDetail(placeId, serpKey)
      if (restaurant) {
        await recordPlacesSeen([restaurant.place.placeId])
        const body: PlaceDetailResponse = { source: 'google', restaurant }
        return NextResponse.json(body, { headers: NO_STORE })
      }
      // Unknown to SerpAPI — fall through: a demo slug may still resolve.
    } catch (error) {
      // Quota-limited channel: status-only log, then degrade to demo/404.
      console.error('[sensemap] /api/places/[placeId]: SerpAPI unavailable, using demo data:', error instanceof Error ? error.message : 'unknown error')
    }
  }

  const demo = DEMO_RESTAURANTS.find((r) => r.id === placeId)
  if (!demo) return NextResponse.json({ error: 'Place not found' }, { status: 404, headers: NO_STORE })
  const body: PlaceDetailResponse = { source: 'demo', restaurant: demo }
  return NextResponse.json(body, { headers: NO_STORE })
}
