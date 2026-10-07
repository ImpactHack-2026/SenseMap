import 'server-only'
import { analyzeReviewsSmart } from '../analysis'
import { PAGE_SIZE } from './google-places'
import { recordPlacesSeen } from './store'
import { FREMONT_CENTER } from '../sensory'
import type { PlaceInfo, Restaurant } from '../types'

/**
 * SerpAPI fallback client — used only when `SERPAPI_KEY` is set and
 * `GOOGLE_PLACES_API_KEY` is not (docs/DATA_POLICY.md, "retrieval channels").
 *
 * SerpAPI is a *transport* for Google Maps content, not a separate data
 * source: everything returned here originates from Google Maps listings, so
 * results keep `source: 'google'` and the app's Google attribution. The
 * channel is disclosed in README/DATA_POLICY.
 *
 * Data policy (docs/DATA_POLICY.md) — the same rules as the official client:
 * - **No caching (D3):** every fetch passes `cache: 'no-store'`.
 * - **Reviews only on detail:** search returns summary fields only; review
 *   text is fetched by `fetchSerpPlaceDetail()` where a screen renders it.
 * - **At most five reviews per place (D6):** both detail paths feed the
 *   analyzer at most 5 reviews, keeping the ≤5 sample disclosure true.
 * - **Place IDs only, stored long-term:** the `placeId` used everywhere is
 *   Google's own Place ID (`ChIJ…`), never SerpAPI's `data_id`.
 * - **D7:** failures throw fixed messages; upstream bodies (which may
 *   contain review text) never reach logs or clients.
 * - The API key never leaves the server (`server-only`); it travels as an
 *   `api_key` query parameter because that is how SerpAPI authenticates,
 *   so error logs must only ever carry status codes, never URLs.
 *
 * Quota: SerpAPI's free tier is ~100 searches/month and every call below
 * costs one search. The SSR list path is therefore capped at
 * `SERP_LIST_LIMIT` analyzed places, and callers fall back to demo data on
 * any failure (including 429 quota exhaustion).
 */

/** Google Text Search page size; SerpAPI Maps pages match it (offsets of 20). */
const SERP_PAGE_SIZE = PAGE_SIZE

/** Google Maps recommends at most a 100-result offset (6 pages of 20). */
const SERP_MAX_START = 100

/** Analyzed places fetched for the SSR list (bounds per-render quota cost). */
export const SERP_LIST_LIMIT = 6

/** Analysis reads at most five reviews per place (D6 — keeps copy true). */
const MAX_REVIEWS_FOR_ANALYSIS = 5

const SERP_ENDPOINT = 'https://serpapi.com/search.json'

// ---------------------------------------------------------------------------
// Response shapes (SerpAPI Google Maps engines, 2026 docs)
// ---------------------------------------------------------------------------

interface SerpLocalResult {
  position?: number
  title?: string
  place_id?: string
  data_id?: string
  address?: string
  rating?: number
  reviews?: number
  type?: string | string[]
  thumbnail?: string
  gps_coordinates?: { latitude?: number; longitude?: number }
}

interface SerpSearchResponse {
  local_results?: SerpLocalResult[]
  error?: string
}

interface SerpReview {
  snippet?: string
  user?: { name?: string }
  rating?: number
  date?: string
  iso_date?: string
}

interface SerpPlaceResults {
  title?: string
  place_id?: string
  data_id?: string
  address?: string
  rating?: number
  reviews?: number
  price?: string
  type?: string[]
  type_ids?: string[]
  gps_coordinates?: { latitude?: number; longitude?: number }
  thumbnail?: string
  images?: { thumbnail?: string }[]
  hours?: Record<string, string>[]
  service_options?: { dine_in?: boolean; outdoor_seating?: boolean }
  user_reviews?: {
    summary?: { snippet?: string }[]
    most_relevant?: { username?: string; description?: string; date?: string }[]
  }
}

interface SerpPlaceResponse {
  place_results?: SerpPlaceResults
  error?: string
}

interface SerpReviewsResponse {
  place_info?: { title?: string; address?: string; rating?: number; reviews?: number; type?: string }
  reviews?: SerpReview[]
  error?: string
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * One SerpAPI call. Always `no-store` (D3). Throws fixed messages only (D7):
 * status codes are safe to log, response bodies are not — they can carry
 * review text.
 */
async function serpGet(params: Record<string, string>): Promise<unknown> {
  const url = `${SERP_ENDPOINT}?${new URLSearchParams({ engine: 'google_maps', ...params })}`
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store' })
  } catch {
    // Message only: the URL carries the api_key, so it must never be logged.
    throw new Error('SerpAPI request failed: network error')
  }
  if (!res.ok) throw new Error(`SerpAPI request failed: ${res.status}`)
  try {
    return (await res.json()) as unknown
  } catch {
    // Fixed message: JSON parse errors can quote the body (D7).
    throw new Error('SerpAPI returned invalid JSON')
  }
}

/** Photos are shown directly from Google's CDN; SerpAPI's own image proxy is not. */
function googlePhoto(url: string | undefined, name: string): { url: string; alt: string }[] {
  return url && /^https:\/\/lh\d+\.googleusercontent\.com\//.test(url) ? [{ url, alt: `Photo of ${name}` }] : []
}

function priceLevel(price: string | undefined): PlaceInfo['priceLevel'] | undefined {
  const level = price ? price.replace(/[^$]/g, '').length : 0
  return level >= 1 && level <= 4 ? (level as 1 | 2 | 3 | 4) : undefined
}

function typesOf(r: SerpLocalResult | SerpPlaceResults): string[] {
  const t = Array.isArray(r.type) ? r.type : r.type ? [r.type] : []
  return t
}

/** Search-result mapping — summary only, never review text. */
function toPlaceInfo(r: SerpLocalResult): PlaceInfo | null {
  // The app's Place IDs must be Google's own (ChIJ…), which satisfy the
  // detail route's ^[\w-]{1,128}$ pattern; entries without one are skipped.
  const placeId = r.place_id
  if (!placeId || !/^[\w-]{1,128}$/.test(placeId)) return null
  const name = r.title?.trim()
  if (!name) return null
  const types = typesOf(r)
  return {
    placeId,
    name,
    address: r.address ?? '',
    latitude: r.gps_coordinates?.latitude ?? 0,
    longitude: r.gps_coordinates?.longitude ?? 0,
    photos: googlePhoto(r.thumbnail, name),
    cuisine: types[0] ?? 'Restaurant',
    categories: types.slice(0, 4).map((t) => t.replace(/_/g, ' ')),
    googleRating: typeof r.rating === 'number' ? r.rating : null,
    reviewCount: typeof r.reviews === 'number' ? r.reviews : 0,
    hours: [],
    // mapsUrl omitted on purpose: googleMapsUrl() builds a Google Maps link
    // from name + address, which is always valid.
  }
}

/** Detail mapping for a place-results body (without analysis). */
function detailToPlace(p: SerpPlaceResults): PlaceInfo {
  const name = p.title?.trim() || 'Unnamed restaurant'
  const types = typesOf(p)
  const hours = (p.hours ?? []).flatMap((entry) =>
    Object.entries(entry).map(([day, range]) => `${day.charAt(0).toUpperCase()}${day.slice(1)}: ${range}`),
  )
  const photos = [
    ...googlePhoto(p.thumbnail, name),
    ...(p.images ?? []).slice(0, 4).flatMap((img) => googlePhoto(img.thumbnail, name)),
  ].slice(0, 4)
  return {
    placeId: p.place_id ?? '',
    name,
    address: p.address ?? '',
    latitude: p.gps_coordinates?.latitude ?? 0,
    longitude: p.gps_coordinates?.longitude ?? 0,
    photos,
    cuisine: types[0] ?? 'Restaurant',
    categories: types.slice(0, 4).map((t) => t.replace(/_/g, ' ')),
    priceLevel: priceLevel(p.price),
    googleRating: typeof p.rating === 'number' ? p.rating : null,
    reviewCount: typeof p.reviews === 'number' ? p.reviews : 0,
    hours,
  }
}

interface SerpReviewInput {
  text: string
  author?: string
  relativeTime?: string
}

/** At most five reviews, in the order the engine ranked them (D6). */
function reviewsFromPlaceResults(p: SerpPlaceResults): SerpReviewInput[] {
  const most = (p.user_reviews?.most_relevant ?? [])
    .filter((r) => typeof r.description === 'string' && r.description.trim().length > 0)
    .slice(0, MAX_REVIEWS_FOR_ANALYSIS)
    .map((r) => ({ text: r.description as string, author: r.username, relativeTime: r.date }))
  if (most.length) return most
  // Fallback: Google's one-line review summaries still carry review language.
  return (p.user_reviews?.summary ?? [])
    .map((s) => s.snippet?.trim())
    .filter((s): s is string => Boolean(s))
    .slice(0, MAX_REVIEWS_FOR_ANALYSIS)
    .map((text) => ({ text: text.replace(/^"|"$/g, '') }))
}

function reviewsFromEngine(r: SerpReviewsResponse): SerpReviewInput[] {
  return (r.reviews ?? [])
    .filter((rev) => typeof rev.snippet === 'string' && rev.snippet.trim().length > 0)
    .slice(0, MAX_REVIEWS_FOR_ANALYSIS)
    .map((rev) => ({ text: rev.snippet as string, author: rev.user?.name, relativeTime: rev.date ?? rev.iso_date }))
}

// ---------------------------------------------------------------------------
// Exposed operations
// ---------------------------------------------------------------------------

/**
 * One page of search results — summary fields only, never review text.
 * Pagination is SerpAPI's `start` offset, carried opaquely as the string
 * token the routes already pass around.
 */
export async function searchSerpPlaces({
  apiKey,
  query,
  pageToken,
}: {
  apiKey: string
  query: string
  pageToken?: string
}): Promise<{ places: PlaceInfo[]; nextPageToken: string | null }> {
  const start = pageToken && /^\d+$/.test(pageToken) ? Math.min(Number(pageToken), SERP_MAX_START) : 0
  const data = (await serpGet({
    api_key: apiKey,
    type: 'search',
    q: query,
    ll: `@${FREMONT_CENTER.latitude},${FREMONT_CENTER.longitude},13z`,
    start: String(start),
    gl: 'us',
    hl: 'en',
  })) as SerpSearchResponse

  if (data.error) throw new Error('SerpAPI request failed: upstream error')
  const places = (data.local_results ?? []).map(toPlaceInfo).filter((p): p is PlaceInfo => p !== null)
  const exhausted = start >= SERP_MAX_START
  const nextPageToken = places.length >= SERP_PAGE_SIZE && !exhausted ? String(start + SERP_PAGE_SIZE) : null
  return { places, nextPageToken }
}

/**
 * On-demand detail for one place: place results (with embedded review
 * snippets) plus — only when that body carried no review text — one
 * google_maps_reviews call. Returns null when SerpAPI does not know the id.
 */
export async function fetchSerpPlaceDetail(placeId: string, apiKey: string): Promise<Restaurant | null> {
  const data = (await serpGet({ api_key: apiKey, place_id: placeId, gl: 'us', hl: 'en' })) as SerpPlaceResponse
  if (data.error || !data.place_results) return null
  const place = data.place_results

  let reviewInputs = reviewsFromPlaceResults(place)
  if (reviewInputs.length === 0) {
    try {
      // Second engine, one extra search: full review snippets for this place.
      const more = (await serpGet({
        api_key: apiKey,
        engine: 'google_maps_reviews',
        place_id: placeId,
        hl: 'en',
      })) as SerpReviewsResponse
      reviewInputs = reviewsFromEngine(more)
    } catch {
      // A failed reviews side-fetch only reduces evidence; the profile still
      // renders with whatever the place body carried (possibly nothing).
      reviewInputs = []
    }
  }

  const placeInfo = { ...detailToPlace(place), placeId }
  const signals = {
    types: place.type_ids ?? typesOf(place),
    outdoorSeating: place.service_options?.outdoor_seating === true,
  }
  return {
    id: placeId,
    source: 'google',
    place: placeInfo,
    sensory: await analyzeReviewsSmart(reviewInputs, signals, placeInfo.name),
  }
}

/**
 * Full analyzed list for the SSR pages: one search plus detail fetches for
 * the first `SERP_LIST_LIMIT` places (each detail usually embeds reviews, so
 * the whole list costs ~1 + limit searches against the free-tier quota).
 * One failing place never breaks the batch; empty results let the caller
 * fall back to demo data.
 */
export async function fetchSerpRestaurants(apiKey: string): Promise<Restaurant[]> {
  const { places } = await searchSerpPlaces({ apiKey, query: 'restaurants in Fremont, CA' })

  const results = await Promise.all(
    places.slice(0, SERP_LIST_LIMIT).map(async (p) => {
      try {
        return await fetchSerpPlaceDetail(p.placeId, apiKey)
      } catch (error) {
        // Status-only: the error message never contains upstream bodies.
        console.error('[sensemap] failed to analyze place via SerpAPI:', error instanceof Error ? error.message : 'unknown error')
        return null
      }
    }),
  )
  const restaurants = results.filter((r): r is Restaurant => r !== null)
  // Phase 3: remember the Place IDs we served (IDs + timestamps only).
  await recordPlacesSeen(restaurants.map((r) => r.id))
  return restaurants
}
