# SenseMap Development Roadmap

Status legend: ✅ done · 🚧 in progress · ⬜ planned

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
- Persist generated profiles (SQLite/Postgres) with a TTL so AI cost is paid once per venue, not per page view
- Background re-analysis job: refresh profiles weekly and on new-review signals
- Search-as-you-type via the Places Autocomplete API; deep-link from a place's Google listing
- Expand beyond the initial 20-place text search to neighborhood-by-neighborhood crawl of Fremont

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
