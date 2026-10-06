import 'server-only'
import { analyzeReviewsSmart } from '../analysis'
import type { PlaceInfo, Restaurant } from '../types'

/**
 * Google Places (new v1) client — live, per-request lookups only.
 *
 * Data policy (docs/DATA_POLICY.md): Place IDs may be stored long-term, but
 * names, addresses, ratings, photos, and reviews must NOT be persisted — they
 * exist only in this process's memory for the current request. The analyzer
 * below may send up to the five reviews Google returns to an inference-only
 * LLM; see the policy's §3 before changing what leaves this module.
 */

const FIELD_MASK = [
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
  'places.regularOpeningHours.weekdayDescriptions',
  'places.reviews',
  'places.outdoorSeating',
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

async function toRestaurant(p: GooglePlace): Promise<Restaurant> {
  const name = p.displayName?.text ?? 'Unnamed restaurant'
  const reviews = (p.reviews ?? [])
    .filter((r) => r.text?.text)
    .map((r) => ({ text: r.text!.text, author: r.authorAttribution?.displayName, relativeTime: r.relativePublishTimeDescription }))

  return {
    id: p.id,
    source: 'google',
    place: {
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
    },
    sensory: await analyzeReviewsSmart(reviews, { outdoorSeating: p.outdoorSeating, types: p.types }, name),
  }
}

export async function fetchGoogleRestaurants(apiKey: string): Promise<Restaurant[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: 'restaurants in Fremont, CA',
      includedType: 'restaurant',
      pageSize: 20,
      locationBias: { circle: { center: { latitude: 37.5485, longitude: -121.9886 }, radius: 12000 } },
    }),
    // Known deviation from data-policy decision D3 (docs/DATA_POLICY.md):
    // Google content must not be cached beyond the current request — this
    // 6-hour revalidation is scheduled for removal in Phase 2.
    next: { revalidate: 60 * 60 * 6 },
  })
  if (!res.ok) throw new Error(`Google Places request failed: ${res.status}`)
  const data = (await res.json()) as { places?: GooglePlace[] }

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
  return results.filter((r): r is Restaurant => r !== null)
}
