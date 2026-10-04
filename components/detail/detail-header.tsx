import Image from 'next/image'
import { Clock } from 'lucide-react'
import type { DataSource, Restaurant } from '@/lib/types'
import { ConfidenceBadge, DataSourceBadge, GoogleRating, ScoreBadge } from '@/components/sensory/primitives'

export function DetailHeader({ restaurant, source }: { restaurant: Restaurant; source: DataSource }) {
  const { place, sensory } = restaurant
  const photo = place.photos[0]

  return (
    <header className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-stretch">
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-muted lg:aspect-auto lg:min-h-80">
        {photo ? (
          <Image
            src={photo.url || '/placeholder.svg'}
            alt={photo.alt}
            fill
            priority
            unoptimized={photo.url.startsWith('/api/')}
            sizes="(min-width: 1024px) 640px, 100vw"
            className="object-cover"
          />
        ) : null}
        {photo?.attribution ? (
          <p className="absolute bottom-2 right-3 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
            Photo: {photo.attribution}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col justify-between gap-6 rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div>
          <DataSourceBadge source={source} />
          <h1 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight text-balance sm:text-4xl">
            {place.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {place.cuisine}
            {place.priceLevel ? ` · ${'$'.repeat(place.priceLevel)}` : ''} · {place.neighborhood ?? 'Fremont'}
          </p>
          <div className="mt-2">
            <GoogleRating rating={place.googleRating} count={place.reviewCount} />
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-6">
          <ScoreBadge score={sensory.senseMapScore} size="lg" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <ConfidenceBadge confidence={sensory.confidence} />
            <span className="text-xs text-muted-foreground">
              Based on {sensory.analyzedReviewCount} {sensory.analyzedReviewCount === 1 ? 'review' : 'reviews'}
            </span>
          </div>
          <p className="flex items-center gap-2 rounded-xl bg-calm-soft px-4 py-3 text-sm">
            <Clock className="size-4 shrink-0 text-calm" aria-hidden="true" />
            <span>
              <span className="text-muted-foreground">Calmest time to visit: </span>
              <span className="font-medium">{sensory.bestTimeLabel}</span>
            </span>
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The SenseMap Score is our estimate of how calm and predictable this space tends to feel. It is separate from
            the Google rating, which reflects overall customer satisfaction.
          </p>
        </div>
      </div>
    </header>
  )
}
