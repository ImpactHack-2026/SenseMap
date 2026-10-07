'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'

const FACTORS = [
  ['noise', 'Noise'],
  ['lighting', 'Lighting'],
  ['crowding', 'Crowding'],
  ['smell', 'Smell'],
  ['seating', 'Seating'],
  ['intensity', 'Overall intensity'],
] as const

const MAX_NOTE_LENGTH = 1000

/**
 * Submit the visitor's OWN sensory note about a place (app-owned data,
 * Phase 3). Consent is mandatory — the API rejects submissions without it.
 */
export function FeedbackForm({ placeId }: { placeId: string }) {
  const [factor, setFactor] = useState<string>('noise')
  const [note, setNote] = useState('')
  const [visitTime, setVisitTime] = useState('')
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!consent) {
      setMessage({ kind: 'error', text: 'Please confirm consent before saving your note.' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId,
          factor,
          note: note.trim() || undefined,
          visitTime: visitTime ? new Date(visitTime).toISOString() : undefined,
          consent: true,
        }),
      })
      if (res.status === 503) {
        setMessage({ kind: 'error', text: 'Saving needs the database to be configured.' })
        return
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setMessage({ kind: 'error', text: body?.error ?? 'Could not save your note.' })
        return
      }
      setMessage({ kind: 'success', text: 'Thanks — your note was saved.' })
      setNote('')
      setConsent(false)
      setVisitTime('')
    } catch {
      setMessage({ kind: 'error', text: 'Could not save your note.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Share your own note</h3>

      <label className="flex flex-col gap-1.5 text-sm" htmlFor="feedback-factor">
        Factor
        <select
          id="feedback-factor"
          value={factor}
          onChange={(e) => setFactor(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          {FACTORS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm" htmlFor="feedback-note">
        Your note <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea
          id="feedback-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          rows={3}
          placeholder="What was it like for your senses?"
          className="rounded-md border border-border bg-background p-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm" htmlFor="feedback-visit">
        Visit time <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          id="feedback-visit"
          type="datetime-local"
          value={visitTime}
          onChange={(e) => setVisitTime(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        />
      </label>

      <label className="flex items-start gap-2.5 text-sm text-foreground/85" htmlFor="feedback-consent">
        <input
          id="feedback-consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4"
        />
        <span>I agree to store this note with SenseMap. It is my own words, not a Google review.</span>
      </label>

      <Button type="submit" size="sm" disabled={saving}>
        {saving ? 'Saving…' : 'Save my note'}
      </Button>

      <p aria-live="polite" className={message?.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
        {message?.text ?? ''}
      </p>
    </form>
  )
}
