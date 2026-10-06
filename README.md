# SenseMap

*For ImpactHack 2026*

A star rating tells you if the food is good. It doesn't tell you if the room is painfully loud, lit by harsh fluorescent lights, or packed shoulder to shoulder at 7pm. For people with autism, sensory processing differences, migraines, or anxiety, those details decide whether a night out is enjoyable or unbearable — and right now the only way to find out is to show up and hope.

SenseMap fixes that. Search for a place in Fremont and our AI reads its public reviews, pulling out what people say about noise, lighting, crowding, and smells. It returns a clear sensory profile with:

- Easy-to-read scores for each sensory category (higher = calmer and easier on the senses)
- The best times to visit, such as quieter weekday afternoons
- Quiet spots within the venue, like a back patio or booths along a wall
- The evidence behind each score, so you can see why it was rated that way
- A confidence rating, and an honest "limited evidence" when reviews don't say

SenseMap never claims a place is guaranteed safe or quiet. It helps you make a more informed choice. The interface is built with accessibility in mind: high contrast, keyboard navigation, no reliance on color alone, and a calm design.

**Launch city: Fremont, CA** — one city first, so accuracy can be checked closely. Next: nearby Bay Area cities, photo-based lighting analysis, and personal sensitivity preferences.

---

## Features

### Frontend (React 19 / Next.js App Router)

- **Calm, low-stimulation design** — warm paper palette, generous spacing, gentle type scale, `prefers-reduced-motion` respected
- **Search + filter + rank** — free-text search over name/cuisine/neighborhood, sensory filters (noise, lighting, crowding, smell, seating, best time), and sortable results ("Calmest first" is the default ranking)
- **Sensory profiles** — per-factor cards, a 0–100 SenseMap Score ring, an hourly busyness chart (with an accessible data table equivalent), and expandable evidence with verbatim review excerpts
- **Accessibility-first details** — skip-to-content link, visible focus rings, semantic landmarks, `aria-live` result counts, fieldset/legend filter groups, icons + text labels + color (never color alone), screen-reader text on charts and ratings
- **Honest uncertainty** — every estimate carries a confidence level; pages label demo vs. live data and AI vs. keyword analysis
- Home, Explore, How-it-works, and per-restaurant pages; 404 fallback

### Backend (Node.js via Next.js server)

- **Google Places integration (new v1 API)** — text search over Fremont restaurants with reviews, photos, hours, price level, and maps links; a keyless demo dataset of fictional Fremont restaurants keeps the app fully functional without credentials
- **Photo proxy** — `/api/places/photo` streams Google photos through the server so the API key never reaches the browser
- **AI review analysis** — pluggable LLM analyzer turns raw review text into a structured `SensoryProfile` (works with Gemini, Grok/xAI, or any OpenAI-compatible API key)
- **Transparent keyword analyzer** — `review-keyword-v1`, a deterministic lexicon-based scorer that runs when no AI key is set or the LLM fails; always available, always explainable
- **Strict output validation** — LLM responses are coerced field-by-field; evidence excerpts are verified to be verbatim substrings of real reviews (hallucinated quotes are dropped), and malformed output falls back to the keyword analyzer
- **Resilience** — Google outages fall back to demo data; one failing place never breaks a batch; per-factor confidence tracking throughout

## How the analysis works

SenseMap ships with three data paths that all produce the same profile shape, so the UI never branches:

| Mode | When | Reviews | Method label |
| --- | --- | --- | --- |
| Demo | No `GOOGLE_PLACES_API_KEY` | Curated illustrative excerpts | `demo-curated` |
| Keyword | Google data + no AI key (or AI failure) | Real Google reviews, lexicon matching | `review-keyword-v1` |
| AI | Google data + any AI provider key | Real Google reviews, LLM reasoning | `llm-v1` |

The AI provider is picked automatically in this order, or forced with `AI_PROVIDER`:

1. **Gemini** — `GEMINI_API_KEY` (default model `gemini-2.5-flash`)
2. **Grok (xAI)** — `XAI_API_KEY` or `GROK_API_KEY` (default `grok-4-fast`)
3. **OpenAI-compatible** — `OPENAI_API_KEY`, optional `OPENAI_BASE_URL` / `OPENAI_MODEL` (OpenAI, OpenRouter, or a self-hosted gateway)

The prompt asks the model to estimate each factor from review evidence only, quote excerpts verbatim, and mark low-mention factors as "limited" confidence. `lib/analysis/llm-analyzer.ts` then validates every field and re-derives anything missing.

## Data & compliance

SenseMap treats Google Places as a **live source, not a database**. The full boundary — including team sign-off decisions — lives in [docs/DATA_POLICY.md](docs/DATA_POLICY.md). In short:

- **Stored long-term:** Google Place IDs (exempt from Places storage restrictions), the fictional demo dataset, and — once added — app-owned data (saved Place IDs, the user's own feedback). Google names, addresses, ratings, photos, and reviews are **never** persisted.
- **Displayed:** Google content is fetched on the user's request and shown with attribution and a link to its source. Search results are ranked matches, not an exhaustive census of a city's restaurants.
- **Sent to the analyzer:** at most the five reviews Google returns per place, to an inference-only LLM endpoint (never used as training data), keys server-side, with the keyword analyzer as a keyless fallback. Review-derived sensory profiles are **not persisted** while their source is Google review text.
- **Logged:** counts, place names, and error codes — no review text.

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production build
```

Every API key is optional — the app degrades gracefully. Copy `.env.example` to `.env.local` (or set keys in your hosting environment):

| Variable | Purpose |
| --- | --- |
| `GOOGLE_PLACES_API_KEY` | Live Fremont restaurant data from Google Places (new v1 API). Without it: demo dataset. |
| `GEMINI_API_KEY` | AI review analysis via Gemini |
| `XAI_API_KEY` (or `GROK_API_KEY`) | AI review analysis via Grok |
| `OPENAI_API_KEY` | AI review analysis via any OpenAI-compatible endpoint |
| `OPENAI_BASE_URL` | Custom endpoint base (default `https://api.openai.com/v1`) |
| `AI_PROVIDER` | `auto` (default) \| `gemini` \| `grok` \| `openai` \| `off` |
| `GEMINI_MODEL` / `XAI_MODEL` / `OPENAI_MODEL` | Model overrides |

## API surface

| Route | Description |
| --- | --- |
| `GET /` | Home: hero search, calmer picks, how-it-works |
| `GET /explore` | Search, sensory filters, and ranking |
| `GET /restaurants/[id]` | Full sensory profile with evidence |
| `GET /api/places/photo?name=…` | Proxied Google Places photo (key stays server-side) |

## Project structure

```
app/                    # Next.js App Router pages + API routes
components/             # Home, explore, detail, sensory, and UI components
lib/
  types.ts              # Shared data model (PlaceInfo, SensoryProfile, …)
  sensory.ts            # Labels, tones, filters, distance math
  data/restaurants.ts   # Single data entry point (Google → demo fallback)
  data/google-places.ts # Google Places (new v1) client
  data/demo-restaurants.ts
  analysis/index.ts     # Analyzer orchestration (AI → keyword fallback)
  analysis/llm-analyzer.ts      # Gemini / Grok / OpenAI-compatible analyzer
  analysis/analyze-reviews.ts   # Transparent keyword analyzer
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased plan: real-data rollout, accuracy validation, photo-based lighting analysis, personal sensitivity preferences, and Bay Area expansion — all governed by the [data & compliance policy](docs/DATA_POLICY.md), which takes precedence where they differ.

## Limitations

Reviews describe individual visits. Sensory conditions change with the day, time, season, and events like birthdays or sports nights. SenseMap does not diagnose, treat, or make any medical claims. When in doubt, call ahead.
