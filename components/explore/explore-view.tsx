'use client'

import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import type { DataSource, Restaurant, RestaurantFilters } from '@/lib/types'
import { activeFilterCount, applyFilters, distanceMiles, EMPTY_FILTERS, FREMONT_CENTER } from '@/lib/sensory'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { RestaurantCard } from '@/components/restaurant-card'
import { DataSourceBadge } from '@/components/sensory/primitives'
import { FilterPanel } from './filter-panel'

type SortKey = 'score' | 'distance' | 'rating'

const SORTERS: Record<SortKey, (a: Restaurant, b: Restaurant) => number> = {
  score: (a, b) => b.sensory.senseMapScore - a.sensory.senseMapScore,
  distance: (a, b) => distanceMiles(FREMONT_CENTER, a.place) - distanceMiles(FREMONT_CENTER, b.place),
  rating: (a, b) => (b.place.googleRating ?? 0) - (a.place.googleRating ?? 0),
}

export function ExploreView({
  restaurants,
  source,
  initialFilters,
}: {
  restaurants: Restaurant[]
  source: DataSource
  initialFilters: RestaurantFilters
}) {
  const [filters, setFilters] = useState(initialFilters)
  const [sort, setSort] = useState<SortKey>('score')

  const results = useMemo(
    () => applyFilters(restaurants, filters).sort(SORTERS[sort]),
    [restaurants, filters, sort],
  )
  const activeCount = activeFilterCount(filters)
  const reset = () => setFilters({ ...EMPTY_FILTERS, query: filters.query })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">Explore Fremont</h1>
          <p className="mt-2 text-muted-foreground">Filter by what matters to you. Every estimate shows its evidence.</p>
        </div>
        <DataSourceBadge source={source} />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="explore-search" className="sr-only">
            Search restaurants or cuisines
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="explore-search"
            type="search"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="Search restaurants or cuisines"
            className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>

        <div className="flex gap-2">
          <Sheet>
            <SheetTrigger
              render={<Button variant="outline" className="h-11 flex-1 rounded-xl lg:hidden" />}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filters
              {activeCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeCount}</span>
              ) : null}
            </SheetTrigger>
            <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Choose the sensory conditions that work for you.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <FilterPanel filters={filters} onChange={setFilters} onReset={reset} />
              </div>
            </SheetContent>
          </Sheet>

          <label htmlFor="sort" className="sr-only">
            Sort results
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring sm:flex-none"
          >
            <option value="score">Sort: Calmest first</option>
            <option value="distance">Sort: Nearest</option>
            <option value="rating">Sort: Google rating</option>
          </select>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-border bg-card p-5">
            <FilterPanel filters={filters} onChange={setFilters} onReset={reset} />
          </div>
        </aside>

        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className="sr-only">
            Results
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {results.length} {results.length === 1 ? 'restaurant' : 'restaurants'}
            {activeCount > 0 ? ` matching ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'}` : ''}
          </p>

          {results.length ? (
            <ul className="mt-4 flex flex-col gap-4">
              {results.map((r, i) => (
                <li key={r.id}>
                  <RestaurantCard restaurant={r} priority={i < 2} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <p className="font-medium">No restaurants match all of these filters.</p>
              <p className="mt-1 text-sm text-muted-foreground">Try removing one or two to see more options.</p>
              <Button variant="outline" className="mt-4" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear search and filters
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
