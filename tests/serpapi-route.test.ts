import { REVIEW_SECRET, captureErrors, setEnv, stubFetch } from './helpers'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET as searchGET } from '../app/api/places/search/route'
import { GET as detailGET } from '../app/api/places/[placeId]/route'
import type { PlacesSearchResponse, PlaceDetailResponse } from '../lib/types'

/**
 * SerpAPI fallback contract (used when SERPAPI_KEY is set and
 * GOOGLE_PLACES_API_KEY is not):
 *  - search returns Google Maps content labeled source 'google', summary
 *    fields only, paginated by SerpAPI's `start` offset;
 *  - detail analyzes at most five reviews through the keyword analyzer;
 *  - any upstream failure degrades to the labeled demo dataset (quota
 *    exhaustion is expected on the free tier) with status-only logs (D7).
 */

const SERP_KEY = 'serp-test-key'
const AI_KEYS_OFF = {
  OPENAI_API_KEY: undefined,
  GEMINI_API_KEY: undefined,
  XAI_API_KEY: undefined,
  GROK_API_KEY: undefined,
}

/** SerpAPI `local_results` entry — summary fields only. */
function serpLocal(id: string, title: string) {
  return {
    position: 1,
    title,
    place_id: id,
    data_id: '0x89c0000000000000:0x1234',
    address: '43820 Fremont Blvd, Fremont, CA 94538',
    rating: 4.2,
    reviews: 187,
    type: 'Fast food restaurant',
    thumbnail: 'https://lh5.googleusercontent.com/p/abc=w120-h90-k-no',
    gps_coordinates: { latitude: 37.5256, longitude: -121.9865 },
  }
}

const search = (qs: string) => new NextRequest(`http://localhost/api/places/search?${qs}`)
const detail = (placeId: string) =>
  detailGET(new NextRequest(`http://localhost/api/places/${placeId}`), {
    params: Promise.resolve({ placeId }),
  })

test('serp search: mapped Google content, start-offset pagination, summary only', async () => {
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: undefined, SERPAPI_KEY: SERP_KEY })
  const starts: string[] = []
  const restoreFetch = stubFetch(async (rawUrl) => {
    const url = new URL(rawUrl)
    assert.equal(url.searchParams.get('engine'), 'google_maps')
    assert.equal(url.searchParams.get('type'), 'search')
    assert.equal(url.searchParams.get('api_key'), SERP_KEY, 'key travels as api_key')
    assert.equal(url.searchParams.get('gl'), 'us')
    assert.ok(url.searchParams.get('ll')?.startsWith('@37.5485,-121.9886'), 'Fremont origin')
    const start = url.searchParams.get('start') ?? '0'
    starts.push(start)
    const count = start === '0' ? 20 : 2
    const local_results = Array.from({ length: count }, (_, i) => serpLocal(`ChIJfremont${start}x${i}`, `Fremont Place ${start}-${i}`))
    return { ok: true, status: 200, json: async () => ({ local_results }) }
  })
  try {
    const res1 = await searchGET(search('q=burger+king'))
    assert.equal(res1.status, 200)
    assert.equal(res1.headers.get('Cache-Control'), 'no-store')
    const b1 = (await res1.json()) as PlacesSearchResponse
    assert.equal(b1.source, 'google', 'Google Maps content keeps Google labeling')
    assert.equal(b1.places.length, 20)
    assert.equal(b1.nextPageToken, '20', 'full page carries the next start offset')
    assert.equal(b1.places[0].placeId, 'ChIJfremont0x0', "Google's own Place ID is the id")
    assert.equal(b1.places[0].photos[0].url, 'https://lh5.googleusercontent.com/p/abc=w120-h90-k-no')
    assert.equal(b1.places[0].googleRating, 4.2)
    const serialized = JSON.stringify(b1)
    assert.ok(!serialized.includes('reviews'), 'no review arrays in the payload')
    assert.ok(!serialized.includes(REVIEW_SECRET), 'no review text in the payload')

    const res2 = await searchGET(search('q=burger+king&pageToken=20'))
    const b2 = (await res2.json()) as PlacesSearchResponse
    assert.equal(b2.places.length, 2, 'short second page')
    assert.equal(b2.nextPageToken, null, 'short page ends the chain')
    assert.deepEqual(starts, ['0', '20'], 'start offsets drive pagination')

    const res3 = await searchGET(search('q=x&pageToken=100'))
    const b3 = (await res3.json()) as PlacesSearchResponse
    assert.equal(b3.nextPageToken, null, 'offset cap (100) ends pagination')
    assert.equal(starts[2], '100')
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('serp search failure: demo fallback with status-only logs (D7)', async () => {
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: undefined, SERPAPI_KEY: SERP_KEY })
  const restoreFetch = stubFetch(async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: REVIEW_SECRET }),
  }))
  const errors = captureErrors()
  try {
    const res = await searchGET(search('q=burger'))
    assert.equal(res.status, 200, 'quota exhaustion degrades, never 502s')
    const body = (await res.json()) as PlacesSearchResponse
    assert.equal(body.source, 'demo')
    assert.ok(body.places.length > 0, 'demo matcher still answers the query')
    const logs = errors.messages().join('\n')
    assert.ok(logs.includes('SerpAPI request failed: 429'), 'status-only upstream error is logged')
    assert.ok(!logs.includes(REVIEW_SECRET), 'no upstream body in logs')
    assert.ok(!JSON.stringify(body).includes(REVIEW_SECRET), 'no upstream body in response')
  } finally {
    errors.restore()
    restoreFetch()
    restoreEnv()
  }
})

test('serp detail: one call, five-review cap, keyword analysis, Google labeling', async () => {
  const restoreEnv = setEnv({
    GOOGLE_PLACES_API_KEY: undefined,
    SERPAPI_KEY: SERP_KEY,
    ...AI_KEYS_OFF,
  })
  const calls: string[] = []
  const restoreFetch = stubFetch(async (rawUrl) => {
    const url = new URL(rawUrl)
    const engine = url.searchParams.get('engine')
    calls.push(engine ?? '')
    assert.equal(url.searchParams.get('place_id'), 'ChIJfremontburgerking')
    if (engine === 'google_maps_reviews') throw new Error('place body already had review text')
    const most_relevant = Array.from({ length: 6 }, (_, i) => ({
      username: `Reviewer ${i}`,
      description: `Review number ${i}: the room was loud and crowded with music all evening long.`,
      date: '2 months ago',
    }))
    return {
      ok: true,
      status: 200,
      json: async () => ({
        place_results: {
          title: 'Burger King',
          place_id: 'ChIJfremontburgerking',
          data_id: '0x89c0000000000000:0x9999',
          address: '39120 Fremont Blvd, Fremont, CA 94538',
          rating: 3.9,
          reviews: 214,
          price: '$',
          type: ['Fast food restaurant', 'Burger restaurant'],
          type_ids: ['fast_food_restaurant', 'hamburger_restaurant'],
          gps_coordinates: { latitude: 37.506, longitude: -121.99 },
          thumbnail: 'https://lh3.googleusercontent.com/p/xyz=w200-h150-k-no',
          images: [{ thumbnail: 'https://lh5.googleusercontent.com/p/img1=w447-h298-k-no' }],
          hours: [{ monday: '6AM–12AM' }, { tuesday: '6AM–12AM' }],
          service_options: { dine_in: true, outdoor_seating: false },
          user_reviews: { most_relevant },
        },
      }),
    }
  })
  try {
    const res = await detail('ChIJfremontburgerking')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const body = (await res.json()) as PlaceDetailResponse
    assert.equal(body.source, 'google')
    assert.equal(body.restaurant.id, 'ChIJfremontburgerking')
    assert.equal(body.restaurant.source, 'google')
    assert.equal(body.restaurant.place.name, 'Burger King')
    assert.equal(body.restaurant.place.priceLevel, 1)
    assert.deepEqual(body.restaurant.place.hours, ['Monday: 6AM–12AM', 'Tuesday: 6AM–12AM'])
    assert.equal(body.restaurant.place.photos.length, 2, 'direct Google CDN photos')
    assert.ok(body.restaurant.place.photos.every((p) => p.url.includes('googleusercontent.com')))
    assert.equal(body.restaurant.sensory.method, 'review-keyword-v1', 'AI keys off → keyword analyzer')
    assert.equal(body.restaurant.sensory.analyzedReviewCount, 5, 'at most five reviews analyzed (D6)')
    assert.deepEqual(calls, ['google_maps'], 'review text came from the place body, one search total')
    const serialized = JSON.stringify(body)
    assert.ok(serialized.includes('Review number 0'), 'review evidence reaches the profile')
    assert.ok(!serialized.includes(REVIEW_SECRET))
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('serp detail: place body without reviews triggers one google_maps_reviews call', async () => {
  const restoreEnv = setEnv({
    GOOGLE_PLACES_API_KEY: undefined,
    SERPAPI_KEY: SERP_KEY,
    ...AI_KEYS_OFF,
  })
  const calls: string[] = []
  const restoreFetch = stubFetch(async (rawUrl) => {
    const url = new URL(rawUrl)
    const engine = url.searchParams.get('engine')
    calls.push(engine ?? '')
    if (engine === 'google_maps_reviews') {
      assert.equal(url.searchParams.get('place_id'), 'ChIJquietcafe')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          place_info: { title: 'Quiet Cafe', address: '1 Main St, Fremont, CA', rating: 4.6, reviews: 42, type: 'Cafe' },
          reviews: [
            { snippet: 'Very calm in the mornings, soft lighting by the window.', user: { name: 'Alex' }, date: 'a month ago' },
            { snippet: 'Peaceful and quiet, great place to read.', user: { name: 'Sam' }, iso_date: '2026-08-01T00:00:00Z' },
          ],
        }),
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        place_results: {
          title: 'Quiet Cafe',
          place_id: 'ChIJquietcafe',
          address: '1 Main St, Fremont, CA',
          rating: 4.6,
          reviews: 42,
          type: ['Cafe'],
          type_ids: ['cafe'],
          gps_coordinates: { latitude: 37.54, longitude: -121.99 },
          user_reviews: { most_relevant: [], summary: [] },
        },
      }),
    }
  })
  try {
    const res = await detail('ChIJquietcafe')
    assert.equal(res.status, 200)
    const body = (await res.json()) as PlaceDetailResponse
    assert.equal(body.restaurant.sensory.method, 'review-keyword-v1')
    assert.equal(body.restaurant.sensory.analyzedReviewCount, 2, 'reviews-engine text feeds the analyzer')
    assert.deepEqual(calls, ['google_maps', 'google_maps_reviews'], 'exactly one reviews-engine follow-up')
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('serp detail failure: demo venue still resolves, unknown id 404s, logs stay status-only', async () => {
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: undefined, SERPAPI_KEY: SERP_KEY })
  const restoreFetch = stubFetch(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: REVIEW_SECRET }),
  }))
  const errors = captureErrors()
  try {
    const demoRes = await detail('juniper-leaf-cafe')
    assert.equal(demoRes.status, 200, 'quota/outage degrades to demo, never 502s')
    const demoBody = (await demoRes.json()) as PlaceDetailResponse
    assert.equal(demoBody.source, 'demo')
    assert.equal(demoBody.restaurant.id, 'juniper-leaf-cafe')

    const missing = await detail('ChIJdoesnotexist')
    assert.equal(missing.status, 404)

    const logs = errors.messages().join('\n')
    assert.ok(logs.includes('SerpAPI request failed: 503'))
    assert.ok(!logs.includes(REVIEW_SECRET), 'no review text in logs (D7)')
    assert.ok(!logs.includes(SERP_KEY), 'the API key never reaches logs')
  } finally {
    errors.restore()
    restoreFetch()
    restoreEnv()
  }
})

test('serp detail: unknown place id is a clean 404, malformed ids still rejected', async () => {
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: undefined, SERPAPI_KEY: SERP_KEY })
  const restoreFetch = stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ error: 'The place id is not valid.' }),
  }))
  try {
    assert.equal((await detail('ChIJnope')).status, 404)
    assert.equal((await detail('bad%2Fid')).status, 400, 'malformed ids are rejected before any fetch')
    assert.equal((await detail('')).status, 400)
  } finally {
    restoreFetch()
    restoreEnv()
  }
})
