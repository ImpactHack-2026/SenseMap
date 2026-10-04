import Image from 'next/image'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PRESETS } from '@/lib/sensory'
import type { DataSource } from '@/lib/types'
import { DataSourceBadge } from '@/components/sensory/primitives'

export function HomeHero({ source, count }: { source: DataSource; count: number }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:pt-16 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <DataSourceBadge source={source} />
        <h1 className="mt-5 font-serif text-4xl font-medium leading-[1.1] tracking-tight text-balance sm:text-5xl">
          Find restaurants that feel right for you.
        </h1>
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground text-pretty">
          Explore Fremont restaurants by noise, lighting, crowding, smells, and the calmest times to visit — so you
          can plan ahead with confidence.
        </p>

        <form action="/explore" method="get" role="search" className="mt-8">
          <label htmlFor="hero-search" className="sr-only">
            Search restaurants or cuisines
          </label>
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="hero-search"
                name="q"
                type="search"
                placeholder="Search restaurants or cuisines in Fremont"
                className="h-12 w-full rounded-xl bg-transparent pl-10 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 rounded-xl px-6">
              Find calm places
            </Button>
          </div>
        </form>

        <div className="mt-5">
          <p id="quick-filters" className="text-sm text-muted-foreground">
            Or start with what matters to you:
          </p>
          <ul aria-labelledby="quick-filters" className="mt-2 flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <li key={key}>
                <Link
                  href={`/explore?preset=${key}`}
                  className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  {preset.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{count} restaurants analyzed in Fremont, CA</p>
      </div>

      <div className="relative">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-muted sm:aspect-[5/4] lg:aspect-[4/5]">
          <Image
            src="/restaurants/lantern-pine.png"
            alt="A calm, softly lit dining room with private wooden booths"
            fill
            priority
            sizes="(min-width: 1024px) 480px, 100vw"
            className="object-cover"
          />
        </div>
        <div className="absolute -bottom-5 left-4 right-4 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur sm:left-auto sm:right-6 sm:w-72">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sensory snapshot</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Noise</dt>
            <dd className="font-medium">Very quiet</dd>
            <dt className="text-muted-foreground">Lighting</dt>
            <dd className="font-medium">Dim / Warm</dd>
            <dt className="text-muted-foreground">Best time</dt>
            <dd className="font-medium">Weekday lunch</dd>
          </dl>
        </div>
      </div>
    </section>
  )
}
