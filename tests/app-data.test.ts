import './helpers'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET as savedGet, POST as savedPost, DELETE as savedDelete } from '../app/api/saved/route'
import { GET as feedbackGet, POST as feedbackPost } from '../app/api/feedback/route'

const USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const json = (body: unknown) =>
  new NextRequest('http://localhost/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const query = (qs: string) => new NextRequest(`http://localhost/api?${qs}`)

test('saved: invalid input is400, missing database is503 db_not_configured', async () => {
  assert.equal((await savedGet(query('userId=nope'))).status, 400)

  const list = await savedGet(query(`userId=${USER_ID}`))
  assert.equal(list.status, 503)
  assert.deepEqual(await list.json(), { error: 'Database not configured', code: 'db_not_configured' })
  assert.equal(list.headers.get('Cache-Control'), 'no-store')

  const badPlace = await savedPost(json({ userId: USER_ID, placeId: 'not a place id!' }))
  assert.equal(badPlace.status, 400)

  const save = await savedPost(json({ userId: USER_ID, placeId: 'demo-juniper-leaf' }))
  assert.equal(save.status, 503)
  assert.equal(((await save.json()) as { code: string }).code, 'db_not_configured')

  const remove = await savedDelete(query(`userId=${USER_ID}&placeId=demo-juniper-leaf`))
  assert.equal(remove.status, 503)
})

test('feedback: consent is mandatory and validation is strict', async () => {
  const noConsent = await feedbackPost(
    json({ placeId: 'demo-juniper-leaf', factor: 'noise', note: 'quiet', consent: false }),
  )
  assert.equal(noConsent.status, 400)
  assert.equal(((await noConsent.json()) as { error: string }).error, 'Consent is required to store a note')

  const badFactor = await feedbackPost(json({ placeId: 'demo-juniper-leaf', factor: 'gravity', note: 'x', consent: true }))
  assert.equal(badFactor.status, 400)

  const badTime = await feedbackPost(
    json({ placeId: 'demo-juniper-leaf', factor: 'noise', note: 'x', visitTime: 'not-a-date', consent: true }),
  )
  assert.equal(badTime.status, 400)

  assert.equal((await feedbackGet(query('placeId=bad!id'))).status, 400)

  const configuredButKeyless = await feedbackPost(
    json({ placeId: 'demo-juniper-leaf', factor: 'noise', note: 'quiet at 3pm', visitTime: '2026-10-01T15:00:00Z', consent: true }),
  )
  assert.equal(configuredButKeyless.status, 503, 'valid consented feedback still degrades without a database')
  assert.equal(((await configuredButKeyless.json()) as { code: string }).code, 'db_not_configured')

  const list = await feedbackGet(query('placeId=demo-juniper-leaf'))
  assert.equal(list.status, 503)
  assert.equal(list.headers.get('Cache-Control'), 'no-store')
})
