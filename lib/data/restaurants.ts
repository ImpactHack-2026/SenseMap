import 'server-only'
import { cache } from 'react'
import type { DataSource, Restaurant } from '../types'
import { DEMO_RESTAURANTS } from './demo-restaurants'
import { fetchGoogleRestaurants } from './google-places'

/**
 * Single entry point for restaurant data. Swap the implementation here
 * (e.g. read from a SenseMap database) without touching any UI.
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
  return { restaurants: DEMO_RESTAURANTS, source: 'demo' }
})

export async function getRestaurant(id: string) {
  const { restaurants, source } = await getRestaurants()
  return { restaurant: restaurants.find((r) => r.id === id) ?? null, source }
}
