import type { Metadata } from 'next'
import { getRestaurants } from '@/lib/data/restaurants'
import { filtersFromPreset } from '@/lib/sensory'
import { ExploreView } from '@/components/explore/explore-view'

export const metadata: Metadata = {
  title: 'Explore Fremont restaurants',
  description: 'Filter Fremont restaurants by noise, lighting, crowding, smell, seating, and the calmest times to visit.',
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; preset?: string }>
}) {
  const [{ q, preset }, { restaurants, source }] = await Promise.all([searchParams, getRestaurants()])
  const initialFilters = filtersFromPreset(preset, q ?? '')

  return <ExploreView restaurants={restaurants} source={source} initialFilters={initialFilters} />
}
