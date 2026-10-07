import { REVIEW_SECRET, captureErrors, setEnv, stubFetch } from './helpers'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from '../app/api/places/[placeId]/route'
import type { PlaceDetailResponse } from '../lib/types'

const detail = (placeId: string) =>
  GET(new NextRequest(`http://localhost/api/places/${placeId}`), {
    params: Promise.resolve({ placeId }),
  })

test('missing key: demo venue is returned and labeled as demo', async () => {
  const restore = setEnv({ GOOGLE_PLACES_API_KEY: undefined })
  try {
    const res = await detail('juniper-leaf-cafe')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const body = (await res.json()) as PlaceDetailResponse
    assert.equal(body.source, 'demo')
    assert.equal(body.restaurant.id, 'juniper-leaf-cafe')
    assert.equal(body.restaurant.source, 'demo')
    assert.equal(body.restaurant.sensory.method, 'demo-curated')
  } finally {
    restore()
  }
})

test('missing key: unknown id is a 404 and malformed ids are rejected', async () => {
  const restore = setEnv({ GOOGLE_PLACES_API_KEY: undefined })
  try {
    assert.equal((await detail('no-such-place')).status, 404)
    assert.equal((await detail('bad%2Fid')).status, 400)
    assert.equal((await detail('')).status, 400, 'empty id fails the Place ID pattern')
  } finally {
    restore()
  }
})

test('Google error: fixed502 message, no review text in response or logs', async () => {
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: 'test-key' })
  const restoreFetch = stubFetch(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ reviews: [{ text: REVIEW_SECRET }] }),
  }))
  const errors = captureErrors()
  try {
    const res = await detail('ChIJsomewhere')
    assert.equal(res.status, 502)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'Google Place Details failed', 'fixed error message only')
    const logs = errors.messages().join('\n')
    assert.ok(!logs.includes(REVIEW_SECRET), 'no review text in logs')
    assert.ok(logs.includes('Google Place Details request failed: 503'), 'status-only upstream error is logged')
  } finally {
    errors.restore()
    restoreFetch()
    restoreEnv()
  }
})

test('Google 404: unknown Place ID is a clean404', async () => {
  const restoreEnv = setEnv({ GOOGLE_PLACES_API_KEY: 'test-key' })
  const restoreFetch = stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }))
  try {
    assert.equal((await detail('ChIJdoesnotexist')).status, 404)
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('D7: non-JSON Google detail bodies surface a fixed message, never the body', async () => {
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
    const res = await detail('ChIJsomewhere')
    assert.equal(res.status, 502)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'Google Place Details failed')
    const logs = errors.messages().join('\n')
    assert.ok(!logs.includes(REVIEW_SECRET), 'parse-error snippets never reach logs')
    assert.ok(logs.includes('Google Places returned invalid JSON'), 'fixed parse-failure message is logged')
  } finally {
    errors.restore()
    restoreFetch()
    restoreEnv()
  }
})
