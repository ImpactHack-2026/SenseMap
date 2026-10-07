'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import type { DataSource, PlaceInfo, PlacesSearchResponse, Restaurant, RestaurantFilters } from '@/lib/types'
import {
  activeFilterCount,
  applyFilters,
  distanceMiles,
  EMPTY_FILTERS,
  FREMONT_CENTER,
  mergeSearchResults,
} from '@/lib/sensory'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { RestaurantCard } from '@/components/restaurant-card'
import { DataSourceBadge } from '@/components/sensory/primitives'
import { FilterPanel } from './filter-panel'
import { SearchResultCard } from './search-result-card'

type SortKey = 'score' | 'rank' | 'distance' | 'rating'

const BROWSE_SORTERS: Record<'score' | 'distance' | 'rating', (a: Restaurant, b: Restaurant) => number> = {
  score: (a, b) => b.sensory.senseMapScore - a.sensory.senseMapScore,
  distance: (a, b) => distanceMiles(FREMONT_CENTER, a.place) - distanceMiles(FREMONT_CENTER, b.place),
  rating: (a, b) => (b.place.googleRating ?? 0) - (a.place.googleRating ?? 0),
}

/** Places without a resolved location sort last instead of to "0,0 miles away". */
function placeDistance(p: PlaceInfo): number {
  return p.latitude === 0 && p.longitude === 0
    ? Number.POSITIVE_INFINITY
    : distanceMiles(FREMONT_CENTER, p)
}

const DEBOUNCE_MS = 350

/**
 * Live search state for the debounced `/api/places/search` round-trips.
 * `source` decides the mode: `google` results are ranked summaries (no
 * sensory profiles → lighter cards, filters/sorts that need profiles are
 * disabled); `demo` results map back onto the full SSR dataset, so sensory
 * filters and cards keep working keyless.
 */
type RemoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      source: DataSource
      places: PlaceInfo[]
      nextPageToken: string | null
      loadingMore: boolean
      moreError: boolean
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
  const [remote, setRemote] = useState<RemoteState>({ status: 'idle' })
  const [retryTick, setRetryTick] = useState(0)
  // Invalidates in-flight responses once the query (or a retry) changes.
  const seqRef = useRef(0)

  const query = filters.query.trim()
  // The mode only changes when a response lands (or the query clears), so the
  // filter panel and sort control don't flicker while a keystroke is in flight.
  const modeRef = useRef(false)
  if (remote.status === 'ready') modeRef.current = remote.source === 'google'
  else if (remote.status === 'idle') modeRef.current = false
  const liveMode = modeRef.current
  const demoRemote = remote.status === 'ready' && remote.source === 'demo'
  // "rank" only exists for live results and "score" only for profiles; keep
  // the user's choice when switching modes instead of resetting it.
  const activeSort: SortKey = liveMode
    ? sort === 'score'
      ? 'rank'
      : sort
    : sort === 'rank'
      ? 'score'
      : sort

  // Debounced search-as-you-type. Each keystroke invalidates the previous
  // sequence; an empty query returns to the server-rendered browse list.
  useEffect(() => {
    const q = filters.query.trim()
    const seq = ++seqRef.current
    if (!q) {
      setRemote({ status: 'idle' })
      return
    }
    const ctrl = new AbortController()
    setRemote({ status: 'loading' })
    const timer = setTimeout(() => {
      fetch(`/api/places/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) throw new Error(`search failed: ${res.status}`)
          return (await res.json()) as PlacesSearchResponse
        })
        .then((body) => {
          if (seqRef.current !== seq) return
          setRemote({
            status: 'ready',
            source: body.source,
            places: body.places,
            nextPageToken: body.nextPageToken,
            loadingMore: false,
            moreError: false,
          })
        })
        .catch((error) => {
          if (ctrl.signal.aborted || seqRef.current !== seq) return
          console.error('[sensemap] explore search failed:', error)
          setRemote({ status: 'error' })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [filters.query, retryTick])

  const loadMore = async () => {
    if (remote.status !== 'ready' || !remote.nextPageToken || remote.loadingMore) return
    const token = remote.nextPageToken
    const seq = seqRef.current
    setRemote({ ...remote, loadingMore: true, moreError: false })
    try {
      const res = await fetch(
        `/api/places/search?q=${encodeURIComponent(query)}&pageToken=${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) throw new Error(`search failed: ${res.status}`)
      const body = (await res.json()) as PlacesSearchResponse
      if (seqRef.current !== seq) return
      // Chain branches are distinct Place IDs; merge dedupes repeats across pages.
      setRemote((r) =>
        r.status !== 'ready'
          ? r
          : {
              ...r,
              places: mergeSearchResults(r.places, body.places),
              nextPageToken: body.nextPageToken,
              loadingMore: false,
              moreError: false,
            },
      )
    } catch (error) {
      if (seqRef.current !== seq) return
      console.error('[sensemap] explore load-more failed:', error)
      setRemote((r) => (r.status === 'ready' ? { ...r, loadingMore: false, moreError: true } : r))
    }
  }

  const restaurantByPlaceId = useMemo(
    () => new Map(restaurants.map((r) => [r.place.placeId, r])),
    [restaurants],
  )

  // Browse mode (empty query): the server-rendered dataset with local filters.
  const browseResults = useMemo(
    () => applyFilters(restaurants, filters).sort(BROWSE_SORTERS[activeSort as 'score' | 'distance' | 'rating']),
    [restaurants, filters, activeSort],
  )

  // Demo-mode search response: same matcher as browsing, so map the returned
  // places back to full restaurants and keep sensory filters/cards working.
  const demoResults = useMemo(() => {
    if (!demoRemote || remote.status !== 'ready') return null
    const mapped = remote.places
      .map((p) => restaurantByPlaceId.get(p.placeId))
      .filter((r): r is Restaurant => r !== undefined)
    return applyFilters(mapped, filters).sort(
      BROWSE_SORTERS[activeSort as 'score' | 'distance' | 'rating'],
    )
  }, [demoRemote, remote, restaurantByPlaceId, filters, activeSort])

  // Live-mode results: Google's ranking by default; other sorts only use
  // summary fields (distance, rating) — never fabricated scores.
  const liveResults = useMemo(() => {
    if (!liveMode || remote.status !== 'ready') return null
    const places = [...remote.places]
    if (activeSort === 'distance') places.sort((a, b) => placeDistance(a) - placeDistance(b))
    else if (activeSort === 'rating') places.sort((a, b) => (b.googleRating ?? 0) - (a.googleRating ?? 0))
    return places
  }, [liveMode, remote, activeSort])

  const activeCount = activeFilterCount(filters)
  const visibleCount = liveMode ? 0 : activeCount
  const reset = () => setFilters({ ...EMPTY_FILTERS, query: filters.query })
  const displaySource: DataSource = liveMode ? 'google' : source

  const resultsLabel = () => {
    if (remote.status === 'loading') return `Searching for “${query}”…`
    if (remote.status === 'error') return 'Search failed.'
    if (liveMode && liveResults) {
      return `${liveResults.length} ranked ${liveResults.length === 1 ? 'result' : 'results'}`
    }
    const n = (demoRemote ? demoResults : browseResults)?.length ?? 0
    return `${n} ${n === 1 ? 'restaurant' : 'restaurants'}${
      visibleCount > 0 ? ` matching ${visibleCount} ${visibleCount === 1 ? 'filter' : 'filters'}` : ''
    }`
  }

  const renderBrowseCard = (r: Restaurant, i: number, key: string) => (
    <li key={key}>
      <RestaurantCard restaurant={r} priority={i < 2} />
    </li>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">Explore Fremont</h1>
          <p className="mt-2 text-muted-foreground">Filter by what matters to you. Every estimate shows its evidence.</p>
        </div>
        <DataSourceBadge source={displaySource} />
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
              {visibleCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{visibleCount}</span>
              ) : null}
            </SheetTrigger>
            <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Choose the sensory conditions that work for you.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <FilterPanel filters={filters} onChange={setFilters} onReset={reset} disabled={liveMode} />
              </div>
            </SheetContent>
          </Sheet>

          <label htmlFor="sort" className="sr-only">
            Sort results
          </label>
          <select
            id="sort"
            value={activeSort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring sm:flex-none"
          >
            {liveMode ? (
              <option value="rank">Sort: Best match</option>
            ) : (
              <option value="score">Sort: Calmest first</option>
            )}
            <option value="distance">Sort: Nearest</option>
            <option value="rating">Sort: Google rating</option>
          </select>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-border bg-card p-5">
            <FilterPanel filters={filters} onChange={setFilters} onReset={reset} disabled={liveMode} />
          </div>
        </aside>

        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className="sr-only">
            Results
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {resultsLabel()}
          </p>
          {liveMode && remote.status === 'ready' ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              These are ranked matches for your search, not a complete census of every restaurant in
              Fremont. Each result opens its full sensory profile, analyzed on demand.
            </p>
          ) : null}

          {remote.status === 'loading' ? (
            <div
              className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Searching for “{query}”…
            </div>
          ) : null}

          {remote.status === 'error' ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <p className="font-medium">Search didn’t go through.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The ranked results couldn’t be loaded. Your filters are untouched.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setRetryTick((t) => t + 1)}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
          ) : null}

          {liveMode && liveResults ? (
            liveResults.length ? (
              <>
                <ul className="mt-4 flex flex-col gap-4">
                  {liveResults.map((p) => (
                    <li key={p.placeId}>
                      <SearchResultCard place={p} />
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-col items-center gap-2">
                  {remote.status === 'ready' && remote.nextPageToken ? (
                    <Button
                      variant="outline"
                      onClick={loadMore}
                      disabled={remote.loadingMore}
                      aria-busy={remote.loadingMore || undefined}
                    >
                      {remote.loadingMore ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          Loading…
                        </>
                      ) : (
                        'Show more results'
                      )}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">End of the ranked results for this search.</p>
                  )}
                  {remote.status === 'ready' && remote.moreError ? (
                    <p className="text-sm text-destructive" role="alert">
                      The next page didn’t load.{' '}
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={loadMore}
                      >
                        Try again
                      </button>
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                <p className="font-medium">No ranked matches for “{query}”.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a different restaurant name, cuisine, or neighborhood.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear search and filters
                </Button>
              </div>
            )
          ) : null}

          {!liveMode && remote.status !== 'error' && remote.status !== 'loading' ? (
            (demoRemote ? demoResults : browseResults)?.length ? (
              <ul className="mt-4 flex flex-col gap-4">
                {(demoRemote ? demoResults : browseResults)!.map((r, i) => renderBrowseCard(r, i, r.id))}
              </ul>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                <p className="font-medium">
                  {query ? `No places match “${query}”.` : 'No restaurants match all of these filters.'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Try removing one or two to see more options.</p>
                <Button variant="outline" className="mt-4" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear search and filters
                </Button>
              </div>
            )
          ) : null}
        </section>
      </div>
    </div>
  )
}
