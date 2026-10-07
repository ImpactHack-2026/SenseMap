# SenseMap Development Roadmap

Status legend: ✅ done · 🚧 in progress · ⬜ planned

> **Data & compliance track:** every phase below builds on [docs/DATA_POLICY.md](DATA_POLICY.md), which defines what SenseMap may store, display, and send to the analyzer. Where this roadmap and the data policy disagree, the policy wins.

## Phase 0 — Foundation ✅

- Next.js 16 (App Router, React 19, TypeScript, Tailwind v4) project scaffold
- Accessibility-first design system: calm palette, focus visibility, semantic landmarks, `prefers-reduced-motion`
- Core pages: home, explore (search + filters + ranking), restaurant detail, how-it-works, 404
- Shared data model (`lib/types.ts`): `PlaceInfo` (Google-sourced) kept strictly separate from `SensoryProfile` (SenseMap-generated)
- Fictional Fremont demo dataset (10 venues) so the product is fully explorable without any API keys

## Phase 1 — Analysis engine ✅

- `review-keyword-v1`: transparent lexicon-based analyzer over review text (noise, lighting, crowding, smell, seating, hourly busyness), with per-factor confidence and cited excerpts
- **AI review analyzer** (`llm-v1`): Gemini, Grok/xAI, or any OpenAI-compatible endpoint; structured-JSON prompt with strict server-side validation
- Hallucination guard: LLM evidence excerpts are verified verbatim against real reviews; invalid factors, levels, and windows are dropped
- Graceful fallback chain: AI → keyword analyzer → demo data, so the app never breaks on a provider outage
- Google Places (new v1) integration: text search, reviews, photos, hours; server-side photo proxy keeps the key private
- TypeScript build errors now fail CI (`ignoreBuildErrors` removed)

## Phase 2 — Real data rollout 🚧

- Add a `GOOGLE_PLACES_API_KEY` and validate AI-generated profiles against a hand-checked sample of ~20 Fremont venues
- ✅ Make the Places integration server-only and live: `GET /api/places/search` + `GET /api/places/[placeId]`, `pageSize: 20` with `nextPageToken` pass-through, and **all caching of Google content removed** (6-hour revalidate, 24-hour photo cache) per data-policy decision D3
- Reduce analyzer cost with request-scoped memoization only — **generated profiles are not persisted** while they derive from Google reviews (data-policy decision D5); revisit if/when storage is confirmed or profiles move to first-party/licensed review data
- ✅ App-owned data store (data-plan Phase 3): Supabase tables for seen Place IDs, saved places, and consented visitor notes — row-level security enabled with no public policies, service-role key server-only (`lib/data/store.ts`, `supabase/migrations/`); Google details stay live-fetched
- Search-as-you-type via the Places Autocomplete API; deep-link from a place's Google listing. *(Data-plan Phase 4 already ships debounced search-as-you-type against Text Search; the Autocomplete API itself remains here.)*
- ✅ Paginated, on-demand search beyond the first 20 results (chain branches keyed by Place ID) — **no background crawler** that pre-loads Fremont listings into a Google-content database (data-policy decision D8). *Implemented in data-plan Phase 4: Explore debounces queries against `GET /api/places/search`, follows `nextPageToken` with a load-more button, and dedupes pages by Place ID; live results show "ranked results, not a census" copy (D2)*

## Phase 3 — Accuracy & trust ⬜

- Human validation panel (neurodivergent reviewers) comparing profiles with lived experience
- "Was this right?" quick feedback widget on each profile, feeding a correction queue
- Confidence calibration: tune thresholds against feedback data
- Show review recency weighting (a 2019 review matters less than last month's)
- Photo-based lighting analysis (vision model estimates of brightness/harshness from venue photos)

## Phase 4 — Personalization ⬜

- Personal sensitivity settings (e.g. "noise matters most", "fluorescent light is a trigger") that reweight the SenseMap Score per user
- Saved places and visit notes ("Tuesday 3pm was quiet for me")
- Optional shareable profiles for families/support workers planning outings together

## Phase 5 — Geography expansion ⬜

- Generalize the city constant into a city registry (Fremont → Newark, Union City, Milpitas → full East Bay)
- Per-city accuracy dashboards before each launch
- Data partnerships (chambers of commerce, autism advocacy orgs) for quieter-venue verification

## Engineering principles

1. **Never conflate sources** — Google data and SenseMap estimates are labeled everywhere.
2. **Show the evidence** — every estimate links to the review excerpts behind it.
3. **Degrade gracefully** — any provider outage falls back, never errors in the user's face.
4. **Accessibility is not a phase** — new features ship with keyboard support, contrast, and non-color signaling from day one.
5. **Store only what we own** — Place IDs and app-owned data persist; Google content is fetched live, displayed with attribution, and never kept (see [docs/DATA_POLICY.md](DATA_POLICY.md)).
