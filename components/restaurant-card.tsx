import Image from 'next/image'
import Link from 'next/link'
import { Clock, MapPin } from 'lucide-react'
import type { Restaurant } from '@/lib/types'
import { distanceMiles, FREMONT_CENTER, googleMapsUrl } from '@/lib/sensory'
import { factorViews } from './sensory/factors'
import { FactorPill, GoogleRating, ScoreBadge } from './sensory/primitives'

export function RestaurantCard({ restaurant, priority = false }: { restaurant: Restaurant; priority?: boolean }) {
  const { place, sensory } = restaurant
  const photo = place.photos[0]
  const pills = factorViews(sensory).filter((f) => ['noise', 'lighting', 'crowding', 'smell'].includes(f.key))
  const miles = distanceMiles(FREMONT_CENTER, place)

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring sm:flex-row">
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-muted sm:aspect-auto sm:w-64">
        {photo ? (
          <Image
            src={photo.url || '/placeholder.svg'}
            alt={photo.alt}
            fill
            priority={priority}
            unoptimized={photo.url.startsWith('/api/')}
            sizes="(min-width: 640px) 256px, 100vw"
            className="object-cover"
          />
        ) : null}
        {photo?.attribution ? (
          <p className="absolute bottom-2 right-3 z-10 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
            Photo: {photo.attribution}
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-xl font-medium leading-snug text-balance">
              <Link href={`/restaurants/${restaurant.id}`} className="after:absolute after:inset-0 focus:outline-none">
                {place.name}
              </Link>
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>{place.cuisine}</span>
              {place.priceLevel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span aria-label={`Price level ${place.priceLevel} of 4`}>{'$'.repeat(place.priceLevel)}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {place.neighborhood ?? 'Fremont'} · {miles.toFixed(1)} mi
              </span>
            </p>
            <div className="mt-1.5">
              <GoogleRating rating={place.googleRating} count={place.reviewCount} />
            </div>
          </div>
          <ScoreBadge score={sensory.senseMapScore} />
        </div>

        <ul className="flex flex-wrap gap-1.5" aria-label="Sensory estimates">
          {pills.map((f) => (
            <li key={f.key}>
              <FactorPill icon={f.icon} name={f.name} value={f.value} tone={f.tone} />
            </li>
          ))}
        </ul>

        <p className="mt-auto inline-flex items-center gap-1.5 text-sm">
          <Clock className="size-4 text-calm" aria-hidden="true" />
          <span className="text-muted-foreground">Best time:</span>
          <span className="font-medium">{sensory.bestTimeLabel}</span>
        </p>

        {restaurant.source === 'google' ? (
          // D2 + D6: attribution with a route to the source, and the
          // ≤5-review sample stated wherever Google-derived estimates show.
          <p className="text-xs leading-relaxed text-muted-foreground">
            SenseMap estimates from up to five Google reviews ·{' '}
            <a
              href={googleMapsUrl(place)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Data from Google
              <span className="sr-only">— opens the source listing in a new tab</span>
            </a>
          </p>
        ) : null}
      </div>
    </article>
  )
}
