import { REVIEW_SECRET, captureErrors, googleBranch, setEnv, stubFetch } from './helpers'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from '../app/api/places/search/route'
import { mergeSearchResults } from '../lib/sensory'
import type { PlacesSearchResponse } from '../lib/types'

const PAGE1 = [
  googleBranch('ChIJstarbucksFremontIrvington', 'Starbucks — Irvington, Fremont'),
  googleBranch('ChIJstarbucksFremontMowry', 'Starbucks — Mowry, Fremont'),
]
const PAGE2 = [
  googleBranch('ChIJstarbucksFremontNiles', 'Starbucks — Niles, Fremont'),
  googleBranch('ChIJstarbucksFremontPaseo', 'Starbucks — Paseo Padre, Fremont'),
]
const CHAIN_QUERY = 'Starbucks Fremont'

interface CapturedCall {
  textQuery: string
  pageToken?: string
  pageSize: number
  fieldMask: string
}

/** Google Text Search double: two pages, records every call's parameters. */
function googleSearchStub(calls: CapturedCall[]) {
  return async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
    assert.match(url, /places:searchText/)
    const body = JSON.parse(init?.body ?? '{}') as { textQuery: string; pageToken?: string; pageSize: number }
    calls.push({
      textQuery: body.textQuery,
      pageToken: body.pageToken,
      pageSize: body.pageSize,
      fieldMask: init?.headers?.['X-Goog-FieldMask'] ?? '',
    })
    const payload =
      body.pageToken === 'PAGE-2'
        ? { places: PAGE2 }
        : body.pageToken
          ? { places: [] }
          : { places: PAGE1, nextPageToken: 'PAGE-2' }
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(payload)) }
  }
}

const search = (qs: string) => new NextRequest(`http://localhost/api/places/search?${qs}`)

test('missing key: demo fallback filters by the query and stays labeled as demo', async () => {
  const restore = setEnv({ GOOGLE_PLACES_API_KEY: undefined })
  try {
    const res = await GET(search('q=juniper'))
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const body = (await res.json()) as PlacesSearchResponse
    assert.equal(body.source, 'demo')
    assert.equal(body.nextPageToken, null)
    assert.equal(body.places.length, 1)
    assert.equal(body.places[0].placeId, 'demo-juniper-leaf')

    const all = (await (await GET(search('q=fremont'))).json()) as PlacesSearchResponse
    assert.ok(all.places.length > 1, 'address matching works in demo mode')
    const serialized = JSON.stringify(all)
    assert.ok(!serialized.includes('google.com'), 'demo responses never carry Google URLs')
    assert.ok(serialized.includes('"source":"demo"'), 'demo label present in payload')
  } finally {
    restore()
  }
})

test('missing key: no match returns an empty page, validation still applies', async () => {
  const restore = setEnv({ GOOGLE_PLACES_API_KEY: undefined })
  try {
    const none = (await (await GET(search('q=zzzznope'))).json()) as PlacesSearchResponse
    assert.equal(none.places.length, 0)
    assert.equal((await GET(search(''))).status, 400)
    const longToken = 'a'.repeat(600)
    assert.equal((await GET(search(`q=x&pageToken=${longToken}`))).status, 400)
  } finally {
    restore()
  }
})

test('pagination: page 1 returns a token, page 2 ends the chain, branches stay distinct', async () => {
  const calls: CapturedCall[] = []
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: 'test-key' })
  const restoreFetch = stubFetch(googleSearchStub(calls))
  try {
    const res1 = await GET(search(`q=${encodeURIComponent(CHAIN_QUERY)}`))
    assert.equal(res1.status, 200)
    assert.equal(res1.headers.get('Cache-Control'), 'no-store')
    const b1 = (await res1.json()) as PlacesSearchResponse
    assert.equal(b1.source, 'google')
    assert.equal(b1.nextPageToken, 'PAGE-2')
    assert.equal(b1.places.length, 2)
    const ids1 = b1.places.map((p) => p.placeId)
    assert.equal(new Set(ids1).size, 2)

    const res2 = await GET(search(`q=${encodeURIComponent(CHAIN_QUERY)}&pageToken=PAGE-2`))
    const b2 = (await res2.json()) as PlacesSearchResponse
    assert.equal(b2.nextPageToken, null)
    const ids2 = b2.places.map((p) => p.placeId)
    assert.ok(ids2.every((id) => !ids1.includes(id)), 'page 2 branches are new places')

    // Chain query reaches Google verbatim, one page at a time.
    assert.equal(calls.length, 2)
    assert.ok(calls.every((c) => c.textQuery === CHAIN_QUERY), 'chain query passed through')
    assert.ok(calls.every((c) => c.pageSize === 20), 'page size is Google\'s max of 20')
    assert.ok(calls.every((c) => c.fieldMask.includes('nextPageToken')), 'token is in the field mask')
    assert.ok(calls.every((c) => !c.fieldMask.includes('reviews')), 'search never requests reviews')
    assert.equal(calls[1].pageToken, 'PAGE-2')
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('duplicate Place IDs: merging pages keeps branches distinct and dedupes repeats', async () => {
  const calls: CapturedCall[] = []
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: 'test-key' })
  const restoreFetch = stubFetch(googleSearchStub(calls))
  try {
    const b1 = (await (await GET(search(`q=${encodeURIComponent(CHAIN_QUERY)}`))).json()) as PlacesSearchResponse
    const b2 = (await (
      await GET(search(`q=${encodeURIComponent(CHAIN_QUERY)}&pageToken=PAGE-2`))
    ).json()) as PlacesSearchResponse

    const merged = mergeSearchResults(b1.places, b2.places)
    assert.equal(merged.length, 4, 'four chain branches are four distinct places')
    assert.equal(new Set(merged.map((p) => p.placeId)).size, 4)

    const withRepeat = mergeSearchResults(b1.places, [...b2.places, b1.places[0]])
    assert.equal(withRepeat.length, 4, 'a Place ID repeated across pages appears once')
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('D7: search responses and logs never contain review text on Google errors', async () => {
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: 'test-key' })
  const restoreFetch = stubFetch(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: REVIEW_SECRET }),
  }))
  const errors = captureErrors()
  try {
    const res = await GET(search('q=starbucks'))
    assert.equal(res.status, 502)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'Google Places search failed', 'fixed error message only')
    const logs = errors.messages().join('\n')
    assert.ok(!logs.includes(REVIEW_SECRET), 'no review text in logs')
    assert.ok(logs.includes('Google Places request failed: 500'), 'status-only upstream error is logged')
  } finally {
    errors.restore()
    restoreFetch()
    restoreEnv()
  }
})

test('D7: a non-JSON Google response surfaces a fixed message, never the body', async () => {
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: 'test-key' })
  const restoreFetch = stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError(`Unexpected token, "${REVIEW_SECRET}" is not valid JSON`)
    },
  }))
  const errors = captureErrors()
  try {
    const res = await GET(search('q=starbucks'))
    assert.equal(res.status, 502)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'Google Places search failed')
    const logs = errors.messages().join('\n')
    assert.ok(!logs.includes(REVIEW_SECRET), 'parse-error snippets never reach logs')
    assert.ok(logs.includes('Google Places returned invalid JSON'), 'fixed parse-failure message is logged')
  } finally {
    errors.restore()
    restoreFetch()
    restoreEnv()
  }
})

test('D7: paginated search responses carry summary fields only (no reviews)', async () => {
  const calls: CapturedCall[] = []
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: 'test-key' })
  const restoreFetch = stubFetch(googleSearchStub(calls))
  try {
    const body = (await (await GET(search(`q=${encodeURIComponent(CHAIN_QUERY)}`))).json()) as PlacesSearchResponse
    const serialized = JSON.stringify(body)
    assert.ok(!serialized.includes('reviews'), 'no review arrays in the payload')
    assert.ok(!serialized.includes(REVIEW_SECRET), 'no review text in the payload')
    assert.ok(body.places.every((p) => !('reviews' in p)))
    assert.ok(body.places.every((p) => typeof p.placeId === 'string' && p.placeId.length > 0))
  } finally {
    restoreFetch()
    restoreEnv()
  }
})
