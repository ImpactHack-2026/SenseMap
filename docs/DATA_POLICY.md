# SenseMap Data & Compliance Policy

**Phase 1 of the Google Places data plan — status: proposed for team sign-off**
Created 2026-10-06. This document is the Phase 1 deliverable: it defines exactly which data SenseMap may **store**, **display**, and **send to the analyzer**, so later phases build on an agreed boundary instead of assumptions.

Phase 1 done-when: *the team has agreed which data can be stored, displayed, and sent to the analyzer* — see [§5 Decisions & sign-off](#5-decisions-requiring-team-sign-off).

---

## 1. Why the boundary exists

Constraints driving this policy (per Google's Maps Platform terms and API documentation as summarized in our repository review — verify against the current agreement before launch):

1. **Place IDs are exempt** from Places content storage restrictions; other Places content generally may **not** be pre-fetched, cached, or stored long-term without an agreement that permits it.
2. **Reviews are a sample, not an archive**: the Place resource returns a **maximum of five reviews per place, sorted by relevance** — not the restaurant's full review history.
3. **Maps content may not be used to train or improve AI models.** Sending review text to an LLM for one-off inference is a different activity from training on it; the workflow must be configured and documented so it is clearly the former.
4. **Attribution is required** when Places content is displayed outside a Google Map, including author attribution for reviews and photos and a route to the source.
5. Text Search returns **20 results per page** with a `nextPageToken` for more — results are ranked matches for a query, never an exhaustive census of a city's businesses.

**Bottom line:** SenseMap can be a live, Google-backed search with review-derived estimates shown on demand. It must **not** become a permanent database of Google Maps listings, reviews, or review-derived profiles.

---

## 2. Data classification — store / display / send matrix

| # | Data class | Examples | Long-term storage | Display | Sent to analyzer |
|---|---|---|---|---|---|
| 1 | **Google Place IDs** | `ChIJ…` | ✅ **Yes** — exempt from storage restrictions; the only Google identifier we keep long-term | ✅ As the stable key for live lookups | ✅ Only as an internal lookup key (not currently sent) |
| 2 | **Google place details** | name, address, coordinates, rating, review count, hours, price level, types, `googleMapsUri` | ❌ **No** — fetch live per user request | ✅ Live, with attribution and "data from Google" labeling | ⚠️ Minimal subset only: venue name, venue types, outdoor-seating flag (prompt context) |
| 3 | **Google review text** | review body, author display name, relative time | ❌ **No** — not in DB, caches, or persistent logs | ⚠️ Short verbatim excerpts only, with author + "via Google" + link to source (source links added in Phase 5) | ✅ **Inference only** — see §3 |
| 4 | **Google photos** | photo media bytes | ❌ **No** — proxy streams through the server; no stored copies | ✅ Via `/api/places/photo` proxy with photographer attribution | ❌ Never |
| 5 | **Review-derived sensory profile** (`SensoryProfile` built from Google reviews) | SenseMap Score, factor levels, hourly chart, evidence excerpts | ❌ **Not until confirmed** — do not persist while its source is Google review text (see D5) | ✅ Live per request, labeled with method (`llm-v1` / `review-keyword-v1`), sample size, and confidence | n/a (it *is* the analyzer output) |
| 6 | **Demo dataset** | fictional Fremont venues in `lib/data/demo-restaurants.ts` | ✅ **Yes** — first-party fictional content | ✅ Always labeled as demo/fictional | ✅ (curated illustrative excerpts) |
| 7 | **App-owned data** (future, Phase 3) | saved places (Place IDs), the user's own sensory feedback + consent, personal sensitivity settings | ✅ **Yes** — own tables, row-level security, separate from Google content | ✅ To their owner only | ⚠️ Only with explicit user consent; never silently |
| 8 | **Logs / telemetry / error reports** | counts, place names, provider labels, error status codes | ✅ Aggregate only | n/a | ❌ **No review text, ever** (see §4) |

**What "no storage" means in practice:** no database rows, no filesystem writes, no Redis/disk caches, no analytics events, no `s-maxage`/`revalidate` caching of Google responses beyond serving the current request, no feature flags that snapshot Places content.

**Retrieval channels.** Google Maps content reaches the app through exactly two transports: the official Places API (`GOOGLE_PLACES_API_KEY`, preferred) and SerpAPI (`SERPAPI_KEY`, used only when the official key is absent). SerpAPI is transport, not a new data source — everything it returns originates from Google Maps listings, keeps `source: 'google'` labeling and Google attribution, is fetched with `cache: 'no-store'` per request, and is held to every rule above, including the ≤5-review analyzer sample (D6/D4) and status-only logging (D7). Because its free tier is quota-limited (~100 searches/month), the SSR list is bounded to 6 analyzed places per render and any SerpAPI failure degrades to the clearly labeled demo dataset instead of erroring.

---

## 3. The analyzer workflow (review completed in Phase 1)

### What flows where today

```
Google Place resource (≤5 reviews)
  → lib/data/google-places.ts      (official API channel), or
    lib/data/serpapi.ts            (SerpAPI transport, same rules)
      (in-memory, per request)
  → lib/analysis/index.ts          (analyzeReviewsSmart)
  → lib/analysis/llm-analyzer.ts   (only when an AI key is configured)
      payload: venue name, venue types, outdoor-seating flag,
               up to 40 reviews × 500 chars (Google supplies ≤5)
      targets: Gemini (GEMINI_API_KEY) | Grok/xAI (XAI_API_KEY)
               | OpenAI-compatible (OPENAI_API_KEY [+ OPENAI_BASE_URL])
  → validated SensoryProfile (evidence excerpts must be verbatim
    substrings of the reviews we actually received; hallucinated
    quotes are dropped)
```

The key never leaves the server (`server-only` modules), and the analyzer result is **not** persisted — it is recomputed per request (Phase 2 may revisit caching under D5).

### Conditions before AI analysis may be enabled in production

- [ ] **Inference, not training.** The selected provider's terms must not use our prompts/inputs to train or improve models. Default to provider API endpoints whose published terms exclude training on API inputs; record the chosen provider and the relevant terms section here at sign-off.
- [ ] **Maps-content review.** Because Google's terms restrict using Maps content to train/improve AI models, confirm this inference-only workflow is consistent with that restriction (and with any Google-specific rule about sending Places content to third-party models). If in doubt, run the analyzer on first-party feedback instead.
- [ ] **No retention on our side.** Review text exists only in the request-scoped memory of the serverless/Node process; it is never written to durable storage (see §4).
- [ ] **`AI_PROVIDER=off` stays available** as a kill switch; the keyword analyzer fallback works without any LLM.

Until these boxes are checked, run the app in keyless demo mode or with `AI_PROVIDER=off` — which is the current state of this repository.

---

## 4. Logging & response audit (Phase 1 finding)

Verified by code search across `lib/` and `app/`:

- `lib/analysis/index.ts` logs review **counts**, venue name, and provider label — no review text. ✅
- `lib/data/restaurants.ts` logs the error object only. ✅
- `lib/analysis/llm-analyzer.ts` throws fixed-status error strings (`Gemini API error 400`, `No JSON object found in model output`) — no payload echo. ✅
- Photo route returns fixed JSON errors; place search has no debug endpoints. ✅
- ~~Gap: a `JSON.parse` failure message can quote a short fragment of model output~~ — **resolved in Phase 6**: `parseLLMJson` and every provider `res.json()` (Gemini, OpenAI-compatible, Google Places search + details) now throw fixed-message errors, so a parse failure can never put review text or Places content into logs; pinned by `tests/analysis-d7.test.ts` and the route tests.

No persistence layer exists yet, so there is nothing to migrate. When Phase 3 adds a database, the schema is limited to classes 1, 6, and 7 above.

---

## 5. Decisions requiring team sign-off

Recommended answers are marked ✅ — Phase 1 is complete when the team accepts or amends each one.

| ID | Decision | Recommendation | Agreed? |
|---|---|---|---|
| **D1** | What counts as "the database"? | Store **only** Google Place IDs + app-owned data (classes 1, 6, 7). Never store Google names, addresses, ratings, photos, raw reviews, or review-derived profiles. | ☐ |
| **D2** | How is Google content served? | Fetched **live on user request** (Phase 2 server routes), displayed with required attribution and a link to the source, never presented as SenseMap's own data, never described as an exhaustive census. | ☐ |
| **D3** | Caching of Google content | **Not permitted beyond the current request.** Decision: remove the 6-hour `next.revalidate` in `lib/data/google-places.ts` and the 24-hour cache headers in `app/api/places/photo/route.ts`. *Implemented in Phase 2: every Google fetch now passes `cache: 'no-store'`, route responses send `Cache-Control: no-store`, and the photo proxy no longer caches.* | ☐ |
| **D4** | What may be sent to the analyzer? | Google review text (≤5 reviews, verbatim excerpts required) + minimal venue context, to an **inference-only** LLM endpoint, keys server-side, kill switch available, never used as training data. AI stays off in production until §3 conditions are checked. | ☐ |
| **D5** | Persist generated sensory profiles? | **No — not while they derive from Google reviews.** Revisit only after the applicable storage/analysis workflow is confirmed, or persist profiles derived from first-party / licensed review data instead. Cost-per-venue caching must use a permitted mechanism (e.g., short request-scoped memoization) in the meantime. | ☐ |
| **D6** | Review-sample disclosure | All Google-derived estimates must state they rest on **up to five reviews**; confidence labels must not imply broad coverage (UI wording lands in Phase 5). *Implemented in Phase 5: the detail header states "Google returns at most five reviews per place — estimates rest on that sample", Google-source cards carry "SenseMap estimates from up to five Google reviews" next to a source link, the evidence section names the ≤5 sample, and confidence labels are scoped to "this review sample".* | ☐ |
| **D7** | Log/response retention | No review text or other Places content in logs, analytics, error reporting, or API responses beyond what the page displays. Enforced with tests in Phase 6. *Implemented in Phase 6: `pnpm test` (24 tests in `tests/`) seeds a review-text canary and asserts it never appears in logs or error responses, pins every fixed upstream error message, and covers pagination, duplicate Place IDs, chain queries, missing keys, Google errors, and demo labeling — including the SerpAPI channel (`tests/serpapi-route.test.ts`: quota-failure degradation, status-only logs, five-review cap, summary-only search payloads).* | ☐ |
| **D8** | Future database scope (Phase 3) | Separate tables (`google_place_ids`, `saved_places`, `user_sensory_feedback`) with row-level security; **no** copied index of Google content; **no** background crawler pre-loading Fremont listings. Search stays on-demand and paginated (`nextPageToken`). *Implemented in Phase 3: schema in `supabase/migrations/`, RLS enabled with zero public policies, service-role key server-only via `lib/data/store.ts`; only Place IDs + timestamps are recorded from Google paths.* | ☐ |

**Sign-off**

| Name / role | Date | Notes |
|---|---|---|
| | | |
| | | |

---

## 6. Known deviations & what Phase 1 deliberately did *not* change

Phase 1 sets the boundary; later phases implement against it. Status of the tracked items:

1. ~~6-hour response cache / 24-hour photo cache~~ — **resolved in Phase 2**: every Google fetch passes `cache: 'no-store'`, the API routes send `Cache-Control: no-store`, and the photo proxy no longer caches.
2. ~~Explore still renders one server-fetched page.~~ — **resolved in Phase 4**: Explore queries `GET /api/places/search` with a debounced search-as-you-type and a "Show more results" load-more that follows `nextPageToken` (max 20 per page, deduped by Place ID). Live results render as summary cards whose links open the on-demand detail page; sensory filters and profile-based sorts are disabled while ranked summaries are shown; results are labeled as ranked matches, not a census (D2).
3. ~~Attribution gaps~~ — **resolved in Phase 5**: excerpt attributions link directly to the place's Google listing ("via Google" anchor), every card shows "Data from Google" with a source link plus photographer credit on photos, and the page-level data badge links to Google Maps (D2).
4. ~~Sample-size disclosure~~ — **resolved in Phase 5 (D6)**: the detail header states Google returns at most five reviews per place and the profile rests on that sample; Google-source cards state the same; confidence labels are scoped to the review sample.
5. **`docs/ROADMAP.md` items that conflicted with this policy** (profile persistence, Fremont crawl) were amended to match D5/D8.

## 7. Where each later phase picks this up

- **Phase 2** — ✅ server-only search/detail routes (`/api/places/search`, `/api/places/[placeId]`), `pageSize: 20` + `nextPageToken` pass-through, reviews/photos fetched only where needed, all Google caching disabled (D3). Remaining console-side step: apply API-key restrictions (HTTP referrer + API allowlist) in Google Cloud.
- **Phase 3** — ✅ Supabase for Place IDs + app-owned data only (`/api/saved`, `/api/feedback`, place-ID registry), RLS enabled with no public policies, service-role key server-side (D1, D8). User identity is an anonymous device-local UUID until accounts exist; consent is mandatory for every stored note.
- **Phase 4** — ✅ Explore queries the search route with debounce + load-more; chain-branch results keyed by Place ID; honest "ranked results, not a census" copy (D2).
- **Phase 5** — ✅ per-location detail fetch (detail screens never trigger the list-wide Google fetch), attribution + source links (excerpt "via Google" anchors, card "Data from Google" links, photo credits, linked data badge — D2), ≤5-review sample disclosure on every Google-derived estimate, and confidence labels scoped to the sample (D6, D2).
- **Phase 6** — ✅ tests for pagination, duplicate Place IDs, chain queries, missing keys, Google errors (`tests/search-route.test.ts`, `tests/detail-route.test.ts`); log/response review-text check with a seeded canary (D7) plus the fixed-message parse-failure fix (`tests/analysis-d7.test.ts`, `tests/app-data.test.ts`); demo data stays clearly labeled. Run with `pnpm test` (Node's built-in runner, no new dependencies); CI runs typecheck → test → build.
