import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, MapPin } from 'lucide-react'
import type { PlaceInfo } from '@/lib/types'
import { distanceMiles, FREMONT_CENTER, googleMapsUrl } from '@/lib/sensory'
import { GoogleRating } from '@/components/sensory/primitives'

/**
 * Card for a ranked search result: summary fields only, because
 * `/api/places/search` deliberately returns no reviews and therefore no
 * SenseMap profile. The profile is computed on the detail page, on demand.
 * Used for live (Google) results; demo results keep the full RestaurantCard.
 */
export function SearchResultCard({ place }: { place: PlaceInfo }) {
  const photo = place.photos[0]
  const hasLocation = place.latitude !== 0 || place.longitude !== 0
  const miles = hasLocation ? distanceMiles(FREMONT_CENTER, place) : null

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring sm:flex-row">
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-muted sm:aspect-auto sm:w-56">
        {photo ? (
          <Image
            src={photo.url || '/placeholder.svg'}
            alt={photo.alt}
            fill
            unoptimized={photo.url.startsWith('/api/')}
            sizes="(min-width: 640px) 224px, 100vw"
            className="object-cover"
          />
        ) : null}
        {photo?.attribution ? (
          <p className="absolute bottom-2 right-3 z-10 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
            Photo: {photo.attribution}
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="min-w-0">
          <h3 className="font-serif text-xl font-medium leading-snug text-balance">
            <Link
              href={`/restaurants/${place.placeId}`}
              className="after:absolute after:inset-0 focus:outline-none"
            >
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
              {place.neighborhood ?? 'Fremont'}
              {miles !== null ? <> · {miles.toFixed(1)} mi</> : null}
            </span>
          </p>
          <div className="mt-1.5">
            <GoogleRating rating={place.googleRating} count={place.reviewCount} />
          </div>
        </div>

        <p className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          View sensory profile
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </p>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Data from Google ·{' '}
          <a
            href={googleMapsUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Open the source listing
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </div>
    </article>
  )
}
