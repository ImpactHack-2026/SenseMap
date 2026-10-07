import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SavedPlace, SensoryFeedback, SensoryFactorKey } from '../types'

/**
 * App-owned data store (Phase 3 — docs/DATA_POLICY.md decisions D1 / D8).
 *
 * - Stores ONLY: Place IDs + seen timestamps, saved places, and the visitor's
 *   own consented sensory notes. Never Google names, addresses, ratings,
 *   photos, or reviews — Google details stay live-fetched (Phase 2 routes).
 * - Access goes through `SUPABASE_SERVICE_ROLE_KEY`, which never leaves the
 *   server (`server-only`). RLS is enabled on every table with no policies
 *   for public roles, so anonymous database access is denied by design.
 * - Without credentials every function is a graceful no-op (returns null /
 *   empty), keeping the app fully functional keyless.
 */

let client: SupabaseClient | null | undefined

function db(): SupabaseClient | null {
  if (client === undefined) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  }
  return client
}

export function isStoreConfigured(): boolean {
  return db() !== null
}

interface SavedRow {
  place_id: string
  created_at: string
}

interface FeedbackRow {
  id: string
  place_id: string
  factor: string
  note: string | null
  visit_time: string | null
  consent: boolean
  created_at: string
}

const toSaved = (r: SavedRow): SavedPlace => ({ placeId: r.place_id, createdAt: r.created_at })
const toFeedback = (r: FeedbackRow): SensoryFeedback => ({
  id: r.id,
  placeId: r.place_id,
  factor: r.factor as SensoryFactorKey,
  note: r.note,
  visitTime: r.visit_time,
  consent: r.consent,
  createdAt: r.created_at,
})

/**
 * Records that the app has seen these Place IDs (first/last seen timestamps).
 * The ONLY Google-derived data ever written to the database. Never throws:
 * a registry hiccup logs a fixed message and the response still succeeds.
 */
export async function recordPlacesSeen(placeIds: string[]): Promise<void> {
  const supa = db()
  if (!supa || placeIds.length === 0) return
  const now = new Date().toISOString()
  try {
    const { error } = await supa
      .from('google_place_ids')
      .upsert(placeIds.map((place_id) => ({ place_id, last_seen_at: now })), { onConflict: 'place_id' })
    if (error) console.error('[sensemap] place registry update failed:', error.message)
  } catch (error) {
    console.error('[sensemap] place registry update failed:', error instanceof Error ? error.message : 'unknown error')
  }
}

/** Saves a Place ID for a user. Returns null when the store is unconfigured. */
export async function savePlace(
  userId: string,
  placeId: string,
): Promise<{ saved: SavedPlace; alreadySaved: boolean } | null> {
  const supa = db()
  if (!supa) return null

  const { data, error } = await supa
    .from('saved_places')
    .insert({ user_id: userId, place_id: placeId })
    .select('place_id, created_at')
    .single()

  if (!error && data) return { saved: toSaved(data), alreadySaved: false }
  if (error?.code === '23505') {
    // Primary-key conflict: already saved — return the existing row.
    const { data: existing } = await supa
      .from('saved_places')
      .select('place_id, created_at')
      .eq('user_id', userId)
      .eq('place_id', placeId)
      .maybeSingle()
    return existing ? { saved: toSaved(existing), alreadySaved: true } : null
  }
  throw new Error(`save place failed: ${error?.message ?? 'unknown error'}`)
}

/** Removes a saved Place ID. Returns null when the store is unconfigured. */
export async function removePlace(userId: string, placeId: string): Promise<boolean | null> {
  const supa = db()
  if (!supa) return null
  const { data, error } = await supa
    .from('saved_places')
    .delete()
    .eq('user_id', userId)
    .eq('place_id', placeId)
    .select('place_id')
  if (error) throw new Error(`remove place failed: ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** A user's saved Place IDs, newest first. Returns null when unconfigured. */
export async function listSavedPlaces(userId: string): Promise<SavedPlace[] | null> {
  const supa = db()
  if (!supa) return null
  const { data, error } = await supa
    .from('saved_places')
    .select('place_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(`list saved places failed: ${error.message}`)
  return (data ?? []).map(toSaved)
}

/**
 * Stores the visitor's own sensory note. `consent: true` is required by the
 * route before this is called; rows are additionally checked here so
 * unconsented data can never reach the table.
 * Returns null when the store is unconfigured.
 */
export async function submitFeedback(input: {
  placeId: string
  factor: SensoryFactorKey
  note?: string | null
  visitTime?: string | null
}): Promise<SensoryFeedback | null> {
  const supa = db()
  if (!supa) return null
  const { data, error } = await supa
    .from('user_sensory_feedback')
    .insert({
      place_id: input.placeId,
      factor: input.factor,
      note: input.note?.trim() ? input.note.trim() : null,
      visit_time: input.visitTime ?? null,
      consent: true,
    })
    .select('id, place_id, factor, note, visit_time, consent, created_at')
    .single()
  if (error) throw new Error(`submit feedback failed: ${error.message}`)
  return toFeedback(data)
}

/**
 * Consent-ratelisted visitor notes for a place (newest first).
 * Only `consent = true` rows are ever returned. Returns null when
 * the store is unconfigured.
 */
export async function listFeedback(placeId: string): Promise<SensoryFeedback[] | null> {
  const supa = db()
  if (!supa) return null
  const { data, error } = await supa
    .from('user_sensory_feedback')
    .select('id, place_id, factor, note, visit_time, consent, created_at')
    .eq('place_id', placeId)
    .eq('consent', true)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(`list feedback failed: ${error.message}`)
  return (data ?? []).map(toFeedback)
}
