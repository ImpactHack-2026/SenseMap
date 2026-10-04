import 'server-only'
import { analyzeReviews } from '../analysis/analyze-reviews'
import type { PlaceInfo, Restaurant } from '../types'

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

function toRestaurant(p: GooglePlace): Restaurant {
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
    sensory: analyzeReviews(reviews, { outdoorSeating: p.outdoorSeating, types: p.types }),
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
    next: { revalidate: 60 * 60 * 6 },
  })
  if (!res.ok) throw new Error(`Google Places request failed: ${res.status}`)
  const data = (await res.json()) as { places?: GooglePlace[] }
  return (data.places ?? []).map(toRestaurant)
}
