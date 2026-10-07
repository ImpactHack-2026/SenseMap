import 'server-only'
import { cache } from 'react'
import type { DataSource, Restaurant } from '../types'
import { DEMO_RESTAURANTS } from './demo-restaurants'
import { fetchGoogleRestaurants, fetchPlaceDetail } from './google-places'
import { fetchSerpRestaurants, fetchSerpPlaceDetail } from './serpapi'

/**
 * Single entry point for restaurant data. Swap the implementation here
 * (e.g. read from a SenseMap database) without touching any UI.
 *
 * Provider order: official Google Places API → SerpAPI transport (when
 * `SERPAPI_KEY` is set and the Google key is not) → demo dataset. Both live
 * channels return real Google Maps content labeled `source: 'google'`.
 *
 * `cache()` is React's per-request memoization: it only dedupes calls within
 * one render (generateMetadata + page). It is NOT cross-request caching —
 * every live response is fetched with `cache: 'no-store'`
 * (docs/DATA_POLICY.md D3).
 */
export const getRestaurants = cache(async (): Promise<{ restaurants: Restaurant[]; source: DataSource }> => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (apiKey) {
    try {
      const restaurants = await fetchGoogleRestaurants(apiKey)
      if (restaurants.length) return { restaurants, source: 'google' }
    } catch (error) {
      console.error('[sensemap] Google Places unavailable, using demo data:', error)
    }
  }
  const serpKey = process.env.SERPAPI_KEY
  if (serpKey && !apiKey) {
    try {
      const restaurants = await fetchSerpRestaurants(serpKey)
      if (restaurants.length) return { restaurants, source: 'google' }
    } catch (error) {
      // Status-only message: SerpAPI bodies can contain review text (D7).
      console.error('[sensemap] SerpAPI unavailable, using demo data:', error instanceof Error ? error.message : 'unknown error')
    }
  }
  return { restaurants: DEMO_RESTAURANTS, source: 'demo' }
})

/**
 * One place, fetched on demand — the detail screen is the one that renders
 * reviews, so this is where a live lookup fetches them (docs/DATA_POLICY.md,
 * Phase 2). Falls back to demo data only when a live channel is unreachable;
 * an unknown id stays not-found either way.
 */
export const getRestaurant = cache(
  async (id: string): Promise<{ restaurant: Restaurant | null; source: DataSource }> => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    if (apiKey) {
      try {
        const restaurant = await fetchPlaceDetail(id, apiKey)
        return { restaurant, source: 'google' }
      } catch (error) {
        console.error('[sensemap] Google Place Details unavailable, trying demo data:', error)
      }
    }
    const serpKey = process.env.SERPAPI_KEY
    if (serpKey && !apiKey) {
      try {
        const restaurant = await fetchSerpPlaceDetail(id, serpKey)
        if (restaurant) return { restaurant, source: 'google' }
      } catch (error) {
        console.error('[sensemap] SerpAPI details unavailable, trying demo data:', error instanceof Error ? error.message : 'unknown error')
      }
    }
    return { restaurant: DEMO_RESTAURANTS.find((r) => r.id === id) ?? null, source: 'demo' }
  },
)
