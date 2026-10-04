import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { Restaurant } from '@/lib/types'
import { RestaurantCard } from '@/components/restaurant-card'

export function CalmPicks({ restaurants }: { restaurants: Restaurant[] }) {
  return (
    <section aria-labelledby="calm-picks-heading" className="border-t border-border/70 bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="calm-picks-heading" className="font-serif text-3xl font-medium tracking-tight">
              Calmer places to start with
            </h2>
            <p className="mt-2 text-muted-foreground">Highest SenseMap Scores in Fremont right now.</p>
          </div>
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            See all restaurants
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <ul className="mt-8 grid gap-4 lg:grid-cols-2">
          {restaurants.map((r) => (
            <li key={r.id}>
              <RestaurantCard restaurant={r} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
