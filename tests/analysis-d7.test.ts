import { REVIEW_SECRET, captureErrors, setEnv, stubFetch } from './helpers'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLLMJson } from '../lib/analysis/llm-analyzer'
import { analyzeReviewsSmart } from '../lib/analysis'
import { DEMO_RESTAURANTS } from '../lib/data/demo-restaurants'

test('parseLLMJson extracts JSON from fences and prose', () => {
  assert.deepEqual(parseLLMJson('here you go: {"a": 1} done'), { a: 1 })
  assert.deepEqual(parseLLMJson('```json\n{"a": 2}\n```'), { a: 2 })
})

test('§4 gap: malformed model output throws a fixed message without quoting it', () => {
  // V8's parse errors quote the input; this input stands in for review text.
  assert.throws(
    () => parseLLMJson(`{noise: "${REVIEW_SECRET}"}`),
    (error: unknown) =>
      error instanceof Error && error.message === 'Model output was not valid JSON' && !error.message.includes(REVIEW_SECRET),
  )
  assert.throws(
    () => parseLLMJson(REVIEW_SECRET),
    (error: unknown) => error instanceof Error && error.message === 'No JSON object found in model output',
  )
})

test('D7: a failing AI call logs a fixed message and falls back to the keyword analyzer', async () => {
  const restoreEnv = setEnv({
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://ai.invalid/v1',
    OPENAI_MODEL: 'test-model',
    GEMINI_API_KEY: undefined,
    XAI_API_KEY: undefined,
    GROK_API_KEY: undefined,
  })
  const restoreFetch = stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError(`Unexpected token, "${REVIEW_SECRET}" is not valid JSON`)
    },
  }))
  const errors = captureErrors()
  try {
    const profile = await analyzeReviewsSmart([{ text: `The room was loud. ${REVIEW_SECRET}` }], {}, 'Test Cafe')
    assert.equal(profile.method, 'review-keyword-v1', 'keyword fallback still produced a profile')
    assert.ok(profile.evidence.length >= 0)
    const logs = errors.messages().join('\n')
    assert.ok(!logs.includes(REVIEW_SECRET), 'review text never reaches logs')
    assert.ok(logs.includes('AI analysis'), 'the fallback is logged with its provider label')
  } finally {
    errors.restore()
    restoreFetch()
    restoreEnv()
  }
})

test('demo data stays clearly labeled (source, method, and Place IDs)', () => {
  assert.ok(DEMO_RESTAURANTS.length > 0)
  for (const r of DEMO_RESTAURANTS) {
    assert.equal(r.source, 'demo')
    assert.equal(r.sensory.method, 'demo-curated')
    assert.ok(r.place.placeId.startsWith('demo-'), `${r.place.placeId} is a demo id`)
    for (const photo of r.place.photos) {
      assert.ok(!photo.url.includes('google'), 'demo photos never point at Google')
    }
  }
})
