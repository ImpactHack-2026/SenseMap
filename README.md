# SenseMap

*For ImpactHack 2026*

A star rating tells you if the food is good. It doesn't tell you if the room is painfully loud, lit by harsh fluorescent lights, or packed shoulder to shoulder at 7pm. For people with autism, sensory processing differences, migraines, or anxiety, those details decide whether a night out is enjoyable or unbearable — and right now the only way to find out is to show up and hope.

SenseMap fixes that. Search for a place in Fremont and SenseMap reads its public reviews, pulling out what people say about noise, lighting, crowding, and smells. It returns a clear sensory profile with:

- Easy-to-read scores for each sensory category (higher = calmer and easier on the senses)
- The best times to visit, such as quieter weekday afternoons
- Quiet spots within the venue, like a back patio or booths along a wall
- The evidence behind each score, with verbatim review excerpts so you can see why it was rated that way
- An honest confidence rating, and an honest "limited evidence" when reviews don't say

SenseMap never claims a place is guaranteed safe or quiet. It helps you make a more informed choice. The interface is built with accessibility in mind: high contrast, keyboard navigation, no reliance on color alone, and a calm design.

**Launch city: Fremont, CA** — one city first, so accuracy can be checked closely. Next: nearby Bay Area cities, photo-based lighting analysis, and personal sensitivity preferences.

---

## Stack

Next.js 16 (App Router, Server Components + server routes), React 19, TypeScript 5.7, Tailwind CSS v4, shadcn-style UI primitives (`components/ui`), lucide-react icons, Inter + Fraunces via `next/font`, Supabase (app-owned data only), pnpm. See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased plan and [docs/DATA_POLICY.md](docs/DATA_POLICY.md) for the data boundary that governs it.

## Features

### Frontend

- **Calm, low-stimulation design** — warm paper palette, generous spacing, gentle type scale, animated only with CSS (`tw-animate-css`), `prefers-reduced-motion` respected
- **Search + filter + rank** — debounced search-as-you-type against `/api/places/search` with a "Show more results" load-more that follows `nextPageToken`; free-text match over name/cuisine/neighborhood, sensory filters (noise, lighting, crowding, smell, seating, best time), homepage presets ("Quiet", "Less crowded", …), and sortable results ("Calmest first" by default). Live results are labeled as ranked matches — not a census — and keep sensory filters available only for places with profiles
- **Sensory profiles** — per-factor cards, a 0–100 SenseMap Score ring, an hourly busyness chart with an accessible data-table equivalent, and expandable evidence with verbatim review excerpts
- **Accessibility-first details** — skip-to-content link, visible focus rings, semantic landmarks, `aria-live` result counts, fieldset/legend filter groups, icons + text labels + color (never color alone), screen-reader text on charts and ratings
- **Honest uncertainty** — every estimate carries a confidence level scoped to its review sample; pages label demo vs. live data and AI vs. keyword analysis; Google-derived estimates disclose that at most five reviews back them, and excerpts, cards, and badges link back to their Google source
- **Your data** — save places and add your own sensory notes (stored only with consent, under an anonymous device-local id)
- Home, Explore, About/How-it-works, per-restaurant pages, and a 404 fallback; production-only Vercel Analytics

### Backend

- **Two live channels + demo** — the official Google Places API (new v1) when `GOOGLE_PLACES_API_KEY` is set; otherwise the **SerpAPI fallback channel** (`SERPAPI_KEY`) carrying the same Google Maps content with identical labeling and attribution (free tier ≈100 searches/month — the SSR list is bounded to 6 analyzed places per render and quota failures degrade to the labeled demo dataset); without either key a fictional demo dataset keeps the app fully functional
- **Photo proxy** — `/api/places/photo` streams official-API photos through the server so the key never reaches the browser; the SerpAPI channel links Google's CDN directly (both under `images.unoptimized`)
- **AI review analysis** — pluggable LLM analyzer turns raw review text into a structured `SensoryProfile` (Gemini, Grok/xAI, or any OpenAI-compatible endpoint)
- **Transparent keyword analyzer** — `review-keyword-v1`, a deterministic lexicon scorer that runs when no AI key is set or the LLM fails; always available, always explainable
- **Strict output validation** — LLM responses are coerced field-by-field; evidence excerpts must be verbatim substrings of real reviews (hallucinated quotes are dropped); malformed output falls back to the keyword analyzer with a fixed, logged message
- **Resilience** — provider outages fall back to demo data on the fallback path and to fixed 502 messages on the official channel; one failing place never breaks a batch; per-factor confidence tracking throughout
- **App-owned data store** — Supabase Postgres for Place IDs seen, a user's saved places, and consented visitor notes; row-level security enabled with zero public policies, service-role key server-side, graceful keyless degradation (docs/DATA_POLICY.md D8)

## Data paths

Provider order: **official Google Places API → SerpAPI channel → demo dataset.** Every path produces the same profile shape, so the UI never branches:

| Mode | When | Reviews | Method label |
| --- | --- | --- | --- |
| Demo | No `GOOGLE_PLACES_API_KEY` and no `SERPAPI_KEY` | Curated illustrative excerpts | `demo-curated` |
| Keyword | Live Google data (either channel) + no AI key or AI failure | Real Google reviews, lexicon matching | `review-keyword-v1` |
| AI | Live Google data (either channel) + any AI provider key | Real Google reviews, LLM reasoning | `llm-v1` |

The AI provider is picked automatically in this order, or forced with `AI_PROVIDER`:

1. **Gemini** — `GEMINI_API_KEY` (default model `gemini-2.5-flash`)
2. **Grok (xAI)** — `XAI_API_KEY` or `GROK_API_KEY` (default `grok-4-fast`)
3. **OpenAI-compatible** — `OPENAI_API_KEY`, optional `OPENAI_BASE_URL` / `OPENAI_MODEL` (OpenAI, OpenRouter, or a self-hosted gateway)

The prompt asks the model to estimate each factor from review evidence only, quote excerpts verbatim, and mark low-mention factors as "limited" confidence. `lib/analysis/llm-analyzer.ts` then validates every field and re-derives anything missing.

## Data & compliance

SenseMap treats Google Maps content as a **live source, not a database**. The full boundary — including team sign-off decisions — lives in [docs/DATA_POLICY.md](docs/DATA_POLICY.md). In short:

- **Stored long-term:** Google Place IDs (exempt from Places storage restrictions), the fictional demo dataset, and app-owned data — saved Place IDs plus the visitor's own consented notes — in Supabase with row-level security. Google names, addresses, ratings, photos, and reviews are **never** persisted.
- **Displayed:** Google content is fetched on the user's request and shown with attribution and a link to its source, through either transport (official API or SerpAPI — transport never changes the labeling). Search results are ranked matches, not an exhaustive census of a city's restaurants.
- **Sent to the analyzer:** at most five reviews per place, to an inference-only LLM endpoint (never used as training data), keys server-side, with the keyword analyzer as a keyless fallback. Review-derived sensory profiles are **not persisted** while their source is Google review text.
- **Logged:** counts, place names, provider labels, and error status codes — no review text, ever (enforced by tests).

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production build
pnpm test       # typecheck + test suite
```

Every API key is optional — the app degrades gracefully. Set keys in your `.env.local` or hosting environment:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_PLACES_API_KEY` | Preferred live channel: Google Places (new v1 API). |
| `SERPAPI_KEY` | Fallback live channel: the same Google Maps content via SerpAPI when the official key is absent (free tier ≈100 searches/month; failures degrade to demo data). |
| `SUPABASE_URL` | Supabase project URL for app-owned data (saved places, visitor notes). Without it: saving degrades gracefully. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key — never exposed to the browser. |
| `GEMINI_API_KEY` | AI review analysis via Gemini |
| `XAI_API_KEY` (or `GROK_API_KEY`) | AI review analysis via Grok |
| `OPENAI_API_KEY` | AI review analysis via any OpenAI-compatible endpoint |
| `OPENAI_BASE_URL` | Custom endpoint base (default `https://api.openai.com/v1`) |
| `AI_PROVIDER` | `auto` (default) \| `gemini` \| `grok` \| `openai` \| `off` |
| `GEMINI_MODEL` / `XAI_MODEL` / `OPENAI_MODEL` | Model overrides |

Migrations: `pnpm db:migrate` applies `supabase/migrations/` (requires database credentials).

## Testing

```bash
pnpm test     # tsc -p tsconfig.test.json, then Node's built-in test runner
```

No extra test dependencies. The suite (24 tests across `tests/`) covers search pagination, duplicate Place IDs, chain queries, missing-key fallbacks, Google error handling, the D7 guarantee that review text never reaches logs or error responses (a seeded canary string is asserted absent), fixed-message parse failures, demo-data labeling, and the SerpAPI channel (`tests/serpapi-route.test.ts`: start-offset pagination, summary-only payloads, the five-review cap, keyword-analysis wiring, and quota-failure degradation). `tests/setup.ts` normalizes the environment (path-alias hook, `server-only` stub, no database credentials). CI runs typecheck → test → build.

## API surface

| Route | Description |
| --- | --- |
| `GET /` | Home: hero search, calmer picks, how-it-works |
| `GET /explore` | Search, sensory filters, and ranking |
| `GET /about` | How it works & about |
| `GET /restaurants/[id]` | Full sensory profile with evidence |
| `GET /api/places/search?q=…&pageToken=…` | Server-side live search (official Places API, else the SerpAPI channel): ≤20 summary results + `nextPageToken` for the next page; demo fallback without either key; never cached |
| `GET /api/places/[placeId]` | On-demand place detail with analyzed sensory profile (reviews are fetched here, not in search, capped at five); demo fallback without either key; never cached |
| `GET /api/places/photo?name=…` | Proxied Google Places photo (key stays server-side; never cached) |
| `GET/POST/DELETE /api/saved` | Save, list, and remove a user's saved Place IDs (app-owned; anonymous local user id) |
| `GET/POST /api/feedback` | Retrieve and submit the visitor's own sensory notes — consent required, app-owned only |

## Project structure

```
app/                    # Next.js App Router pages + API routes
components/
  home/                 # Hero, calmer picks, how-it-works
  explore/              # Explore view, filter panel, search result cards
  detail/               # Detail header, factor grid, best-times chart, evidence, save, visitor notes
  sensory/              # Shared sensory primitives (score badge, factor pills, source/confidence badges)
  ui/                   # shadcn-style primitives
lib/
  types.ts              # Shared data model (PlaceInfo, SensoryProfile, …)
  sensory.ts            # Labels, tones, filters, distance math, Maps URLs
  data/restaurants.ts   # Single data entry point (Google → SerpAPI → demo)
  data/google-places.ts # Google Places (new v1) client
  data/serpapi.ts       # SerpAPI transport for Google Maps content (fallback channel)
  data/demo-restaurants.ts
  data/store.ts         # App-owned data store (Supabase, server-only)
  client-id.ts          # Anonymous device-local user id (client only)
  analysis/index.ts     # Analyzer orchestration (AI → keyword fallback)
  analysis/llm-analyzer.ts      # Gemini / Grok / OpenAI-compatible analyzer
  analysis/analyze-reviews.ts   # Transparent keyword analyzer
tests/                  # 24-test suite (Node built-in runner) + setup/helpers
supabase/migrations/    # Phase 3 schema: app-owned tables + RLS
docs/                   # DATA_POLICY.md (governs) + ROADMAP.md
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased plan: real-data rollout, accuracy validation, photo-based lighting analysis, personal sensitivity preferences, and Bay Area expansion — all governed by the [data & compliance policy](docs/DATA_POLICY.md), which takes precedence where they differ.

## Limitations

Reviews describe individual visits. Sensory conditions change with the day, time, season, and events like birthdays or sports nights. SenseMap does not diagnose, treat, or make any medical claims. When in doubt, call ahead.
