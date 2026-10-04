import { ExternalLink, MapPin } from 'lucide-react'
import type { Restaurant } from '@/lib/types'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PlaceDetails({ restaurant }: { restaurant: Restaurant }) {
  const { place, sensory } = restaurant
  const mapsUrl =
    place.mapsUrl ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address}`)}`

  return (
    <aside aria-label="Place details" className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium">Location</h2>
        <p className="mt-2 flex items-start gap-2 text-sm text-foreground/85">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {place.address}
        </p>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-4 w-full')}
        >
          Open in Google Maps
          <ExternalLink className="size-4" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      {place.hours.length ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium">Hours</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-foreground/85">
            {place.hours.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}      <div className="rounded-2xl bg-secondary p-5 text-xs leading-relaxed text-muted-foreground">
        <p>
          SenseMap estimates are generated from public reviews and may not reflect every visit. Sensory conditions
          can change by day, time, and event.
        </p>
        <p className="mt-2">
          {sensory.method === 'llm-v1'
            ? `Estimated by AI review analysis${sensory.aiProvider ? ` (${sensory.aiProvider})` : ''}.`
            : sensory.method === 'review-keyword-v1'
              ? 'Estimated by SenseMap\u2019s transparent keyword analysis of public reviews.'
              : 'Illustrative demo profile for a fictional restaurant.'}{' '}
          Analyzed {new Date(sensory.analyzedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}.
        </p>
      </div>
    </aside>
  )
}
