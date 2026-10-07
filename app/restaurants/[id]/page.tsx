import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getRestaurant } from '@/lib/data/restaurants'
import { DEMO_RESTAURANTS } from '@/lib/data/demo-restaurants'
import { DetailHeader } from '@/components/detail/detail-header'
import { FactorGrid } from '@/components/detail/factor-grid'
import { BestTimes } from '@/components/detail/best-times'
import { EvidenceList } from '@/components/detail/evidence-list'
import { PlaceDetails } from '@/components/detail/place-details'
import { VisitorNotes } from '@/components/detail/visitor-notes'

type Props = { params: Promise<{ id: string }> }

/**
 * Per-location detail fetch (docs/DATA_POLICY.md §7 Phase 5): the detail
 * screen never triggers the list-wide Google fetch. Only the keyless demo
 * slugs are pre-rendered; with a key, every id is fetched on demand via
 * `getRestaurant` → `fetchPlaceDetail` for that one place.
 */
export async function generateStaticParams() {
  if (process.env.GOOGLE_PLACES_API_KEY) return []
  return DEMO_RESTAURANTS.map((r) => ({ id: r.id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { restaurant } = await getRestaurant(id)
  if (!restaurant) return { title: 'Restaurant not found' }
  return {
    title: `${restaurant.place.name} — sensory guide`,
    description: `Noise, lighting, crowding, and best times to visit ${restaurant.place.name} in Fremont. ${restaurant.sensory.bestTimeLabel} is typically calmest.`,
  }
}

export default async function RestaurantPage({ params }: Props) {
  const { id } = await params
  const { restaurant, source } = await getRestaurant(id)
  if (!restaurant) notFound()

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8">
      <Link
        href="/explore"
        className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to results
      </Link>

      <DetailHeader restaurant={restaurant} source={source} />

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-12">
          <FactorGrid sensory={restaurant.sensory} />
          <BestTimes sensory={restaurant.sensory} />
          <EvidenceList sensory={restaurant.sensory} place={restaurant.place} source={source} />
        </div>
        <div className="flex flex-col gap-8">
          <PlaceDetails restaurant={restaurant} />
          <VisitorNotes placeId={restaurant.place.placeId} />
        </div>
      </div>
    </div>
  )
}
