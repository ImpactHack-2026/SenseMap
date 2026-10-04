import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getRestaurant, getRestaurants } from '@/lib/data/restaurants'
import { DetailHeader } from '@/components/detail/detail-header'
import { FactorGrid } from '@/components/detail/factor-grid'
import { BestTimes } from '@/components/detail/best-times'
import { EvidenceList } from '@/components/detail/evidence-list'
import { PlaceDetails } from '@/components/detail/place-details'

type Props = { params: Promise<{ id: string }> }

export async function generateStaticParams() {
  const { restaurants, source } = await getRestaurants()
  return source === 'demo' ? restaurants.map((r) => ({ id: r.id })) : []
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
          <EvidenceList sensory={restaurant.sensory} />
        </div>
        <PlaceDetails restaurant={restaurant} />
      </div>
    </div>
  )
}
