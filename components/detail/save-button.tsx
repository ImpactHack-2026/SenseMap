'use client'

import { useEffect, useState } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { getUserId } from '@/lib/client-id'
import { Button } from '@/components/ui/button'
import type { SavedPlacesResponse } from '@/lib/types'

type Status = 'loading' | 'saved' | 'unsaved' | 'unavailable'

/**
 * Save/unsave this Place ID for the anonymous local user (app-owned data,
 * Phase 3). Retrieves saved state on mount; degrades to a disabled button
 * when the database is not configured.
 */
export function SaveButton({ placeId, configured }: { placeId: string; configured: boolean }) {
  const [status, setStatus] = useState<Status>(configured ? 'loading' : 'unavailable')

  useEffect(() => {
    if (!configured) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/saved?userId=${encodeURIComponent(getUserId())}`)
        if (res.status === 503) {
          if (alive) setStatus('unavailable')
          return
        }
        if (!res.ok) {
          if (alive) setStatus('unsaved')
          return
        }
        const data = (await res.json()) as SavedPlacesResponse
        if (alive) setStatus(data.savedPlaces.some((s) => s.placeId === placeId) ? 'saved' : 'unsaved')
      } catch {
        if (alive) setStatus('unsaved')
      }
    })()
    return () => {
      alive = false
    }
  }, [configured, placeId])

  if (!configured) {
    return (
      <Button variant="outline" size="sm" disabled title="Saving requires the database to be configured">
        <Bookmark className="size-4" aria-hidden="true" />
        Save
      </Button>
    )
  }

  const toggle = async () => {
    const userId = getUserId()
    if (!userId) {
      setStatus('unavailable')
      return
    }
    const wasSaved = status === 'saved'
    setStatus(wasSaved ? 'unsaved' : 'saved') // optimistic; rolled back on failure
    try {
      const res = wasSaved
        ? await fetch(`/api/saved?userId=${encodeURIComponent(userId)}&placeId=${encodeURIComponent(placeId)}`, {
            method: 'DELETE',
          })
        : await fetch('/api/saved', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, placeId }),
          })
      if (res.status === 503) {
        setStatus('unavailable')
        return
      }
      if (!res.ok) setStatus(wasSaved ? 'saved' : 'unsaved')
    } catch {
      setStatus(wasSaved ? 'saved' : 'unsaved')
    }
  }

  const saved = status === 'saved'
  const disabled = status === 'loading' || status === 'unavailable'
  return (
    <Button
      variant={saved ? 'default' : 'outline'}
      size="sm"
      onClick={toggle}
      aria-pressed={saved}
      disabled={disabled}
      title={status === 'unavailable' ? 'Saving requires the database to be configured' : undefined}
    >
      {saved ? <BookmarkCheck className="size-4" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
      {status === 'loading' ? 'Loading…' : saved ? 'Saved' : status === 'unavailable' ? 'Save unavailable' : 'Save'}
    </Button>
  )
}
