import 'server-only'
import { analyzeReviewsSmart } from '../analysis'
import { recordPlacesSeen } from './store'
import type { PlaceInfo, Restaurant } from '../types'

/**
 * Google Places (new v1) client — live, per-request lookups only.
 *
 * Data policy (docs/DATA_POLICY.md):
 * - **No caching (D3):** every Google fetch below passes `cache: 'no-store'`.
 *   Responses are never revalidated or stored beyond the current request.
 * - **Reviews only when needed:** `searchPlaces()` requests summary fields only
 *   (never `places.reviews`); reviews are fetched by `fetchPlaceDetail()` and
 *   the SSR list path only where a screen actually renders them. Photo *media*
 *   is fetched only on demand via `/api/places/photo`.
 * - Place IDs may be stored long-term; every other field in this module exists
 *   only in this process's memory for the current request.
 * - The API key never leaves the server (this module is `server-only`).
 *
 * Exposed as HTTP routes (app/api/places/):
 * - `searchPlaces()`       → GET /api/places/search?q=…&pageToken=…
 * - `fetchPlaceDetail()`   → GET /api/places/[placeId]
 * - `fetchGoogleRestaurants()` → SSR list pages (analyzed; Explore moves to
 *   the search route in Phase 4)
 */

/** Google Text Search returns at most 20 results per page. */
export const PAGE_SIZE = 20

/** Summary fields every screen can show — no reviews, no hours. */
const SUMMARY_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.photos',
  'places.primaryTypeDisplayName',
  'places.types',
  'places.priceLevel',
  'places.googleMapsUri',
]

// Search mask: summary + the pagination token. `nextPageToken` must be part of
// the field mask or Google omits it from the response.
const SEARCH_FIELD_MASK = [...SUMMARY_FIELDS, 'nextPageToken'].join(',')

// SSR list mask: summary + the fields card analysis needs. Researching the
// list is a user-requested render, so these live only for that request.
const LIST_FIELD_MASK = [
  ...SUMMARY_FIELDS,
  'places.regularOpeningHours.weekdayDescriptions',
  'places.reviews',
  'places.outdoorSeating',
].join(',')

// Place Details (New) uses bare field names — no `places.` prefix — and
// requires an explicit mask. Reviews arrive only here, on demand.
const DETAIL_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'photos',
  'primaryTypeDisplayName',
  'types',
  'priceLevel',
  'googleMapsUri',
  'regularOpeningHours.weekdayDescriptions',
  'reviews',
  'outdoorSeating',
].join(',')

const PRICE: Record<string, PlaceInfo['priceLevel']> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
}

interface GooglePlace {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  rating?: number
  userRatingCount?: number
  photos?: { name: string; authorAttributions?: { displayName: string }[] }[]
  primaryTypeDisplayName?: { text: string }
  types?: string[]
  priceLevel?: string
  googleMapsUri?: string
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  reviews?: { text?: { text: string }; authorAttribution?: { displayName: string }; relativePublishTimeDescription?: string }[]
  outdoorSeating?: boolean
}

/** Maps a Google place to the app's `PlaceInfo` — no analysis, no reviews. */
function toPlaceInfo(p: GooglePlace): PlaceInfo {
  const name = p.displayName?.text ?? 'Unnamed restaurant'
  return {
    placeId: p.id,
    name,
    address: p.formattedAddress ?? '',
    latitude: p.location?.latitude ?? 0,
    longitude: p.location?.longitude ?? 0,
    photos: (p.photos ?? []).slice(0, 4).map((ph) => ({
      url: `/api/places/photo?name=${encodeURIComponent(ph.name)}`,
      alt: `Photo of ${name}`,
      attribution: ph.authorAttributions?.[0]?.displayName,
    })),
    cuisine: p.primaryTypeDisplayName?.text ?? 'Restaurant',
    categories: (p.types ?? []).slice(0, 4).map((t) => t.replace(/_/g, ' ')),
    priceLevel: p.priceLevel ? PRICE[p.priceLevel] : undefined,
    googleRating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? 0,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
    mapsUrl: p.googleMapsUri,
  }
}

function reviewInputs(p: GooglePlace) {
  return (p.reviews ?? [])
    .filter((r) => r.text?.text)
    .map((r) => ({ text: r.text!.text, author: r.authorAttribution?.displayName, relativeTime: r.relativePublishTimeDescription }))
}

async function toRestaurant(p: GooglePlace): Promise<Restaurant> {
  return {
    id: p.id,
    source: 'google',
    place: toPlaceInfo(p),
    sensory: await analyzeReviewsSmart(reviewInputs(p), { outdoorSeating: p.outdoorSeating, types: p.types }, p.displayName?.text ?? 'Unnamed restaurant'),
  }
}

interface TextSearchOptions {
  apiKey: string
  query: string
  fieldMask: string
  pageToken?: string
  includedType?: string
}

interface TextSearchResponse {
  places?: GooglePlace[]
  nextPageToken?: string
}

/** One Text Search call. Always `no-store` — Google content is never cached (D3). */
async function textSearch({ apiKey, query, fieldMask, pageToken, includedType }: TextSearchOptions): Promise<TextSearchResponse> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
      ...(includedType ? { includedType } : {}),
      locationBias: { circle: { center: { latitude: 37.5485, longitude: -121.9886 }, radius: 12000 } },
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Google Places request failed: ${res.status}`)
  try {
    return (await res.json()) as TextSearchResponse
  } catch {
    // Fixed message: JSON parse errors can quote the response body, which is
    // Places content (docs/DATA_POLICY.md D7).
    throw new Error('Google Places returned invalid JSON')
  }
}

/**
 * One page of search results for the given query — summary fields only.
 * Returns at most `PAGE_SIZE` (20) places plus Google's `nextPageToken` for
 * fetching the next page (null when this is the last page).
 */
export async function searchPlaces({
  apiKey,
  query,
  pageToken,
}: {
  apiKey: string
  query: string
  pageToken?: string
}): Promise<{ places: PlaceInfo[]; nextPageToken: string | null }> {
  const data = await textSearch({ apiKey, query, fieldMask: SEARCH_FIELD_MASK, pageToken })
  return {
    places: (data.places ?? []).map(toPlaceInfo),
    nextPageToken: data.nextPageToken ?? null,
  }
}

/**
 * On-demand detail fetch for a single place, including its reviews, followed
 * by analysis. Returns null when Google does not know the id (404).
 */
export async function fetchPlaceDetail(placeId: string, apiKey: string): Promise<Restaurant | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': DETAIL_FIELD_MASK,
    },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Google Place Details request failed: ${res.status}`)
  let place: GooglePlace
  try {
    place = (await res.json()) as GooglePlace
  } catch {
    // Fixed message: JSON parse errors can quote the response body, which is
    // Places content (docs/DATA_POLICY.md D7).
    throw new Error('Google Places returned invalid JSON')
  }
  if (!place.id) return null
  return toRestaurant(place)
}

/**
 * Full analyzed list for the SSR pages (home/explore), kept at the current
 * behavior: fixed Fremont query, reviews included because the cards render
 * review-derived profiles. Explore switches to the lightweight search route
 * in Phase 4. Always `no-store`.
 */
export async function fetchGoogleRestaurants(apiKey: string): Promise<Restaurant[]> {
  const data = await textSearch({
    apiKey,
    query: 'restaurants in Fremont, CA',
    fieldMask: LIST_FIELD_MASK,
    includedType: 'restaurant',
  })

  // Analyze each place independently so one failing place never breaks the batch.
  const results = await Promise.all(
    (data.places ?? []).map(async (p) => {
      try {
        return await toRestaurant(p)
      } catch (error) {
        console.error('[sensemap] failed to analyze place:', error)
        return null
      }
    }),
  )
  const restaurants = results.filter((r): r is Restaurant => r !== null)
  // Phase 3: remember the Place IDs we served (IDs + timestamps only).
  await recordPlacesSeen(restaurants.map((r) => r.id))
  return restaurants
}
