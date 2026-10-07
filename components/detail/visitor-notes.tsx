import { isStoreConfigured, listFeedback } from '@/lib/data/store'
import { FeedbackForm } from './feedback-form'

const FACTOR_LABELS: Record<string, string> = {
  noise: 'Noise',
  lighting: 'Lighting',
  crowding: 'Crowding',
  smell: 'Smell',
  seating: 'Seating',
  intensity: 'Overall intensity',
}

/**
 * Visitor notes for this place (app-owned data, Phase 3): consented
 * first-party submissions — clearly NOT Google reviews (docs/DATA_POLICY.md).
 * Renders nothing until the database is configured, so the keyless app
 * stays unchanged.
 */
export async function VisitorNotes({ placeId }: { placeId: string }) {
  if (!isStoreConfigured()) return null

  let notes: Awaited<ReturnType<typeof listFeedback>> = []
  try {
    notes = await listFeedback(placeId)
  } catch {
    notes = []
  }
  const items = notes ?? []

  return (
    <section aria-labelledby="visitor-notes-heading" className="rounded-3xl border border-border bg-card p-6">
      <h2 id="visitor-notes-heading" className="font-serif text-xl font-medium tracking-tight">
        Visitor notes
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        SenseMap visitors&rsquo; own sensory notes — first-party submissions shared with consent, separate from Google
        reviews.
      </p>

      {items.length ? (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((n) => (
            <li key={n.id} className="rounded-xl border border-border bg-background p-3 text-sm">
              <p className="font-medium">
                {FACTOR_LABELS[n.factor] ?? n.factor}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {new Date(n.createdAt).toLocaleDateString()}
                </span>
              </p>
              {n.note ? <p className="mt-1 text-foreground/85">{n.note}</p> : null}
              {n.visitTime ? (
                <p className="mt-1 text-xs text-muted-foreground">Visited {new Date(n.visitTime).toLocaleDateString()}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No visitor notes yet for this place.</p>
      )}

      <div className="mt-5 border-t border-border pt-5">
        <FeedbackForm placeId={placeId} />
      </div>
    </section>
  )
}
