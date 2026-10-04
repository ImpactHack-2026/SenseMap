import type { IntensityLevel, SensoryProfile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatHour, TIME_WINDOW_LABELS } from '@/lib/sensory'

const LEVEL_STYLE: Record<IntensityLevel, { height: string; bar: string; label: string }> = {
  low: { height: 'h-1/3', bar: 'bg-calm', label: 'Calmer' },
  moderate: { height: 'h-2/3', bar: 'bg-moderate', label: 'Moderate' },
  high: { height: 'h-full', bar: 'bg-intense', label: 'Busier' },
}

export function BestTimes({ sensory }: { sensory: SensoryProfile }) {
  const hours = sensory.bestTimes
  return (
    <section aria-labelledby="times-heading">
      <h2 id="times-heading" className="font-serif text-2xl font-medium tracking-tight">
        Best times to visit
      </h2>
      <p className="mt-2 text-muted-foreground">
        Typical sensory intensity through the day. Usually calmest:{' '}
        <span className="font-medium text-foreground">
          {sensory.bestWindows.map((w) => TIME_WINDOW_LABELS[w]).join(', ') || sensory.bestTimeLabel}
        </span>
        .
      </p>

      <div className="mt-5 rounded-2xl border border-border bg-card p-5">
        <div className="flex h-36 items-end gap-1.5" aria-hidden="true">
          {hours.map((h) => (
            <div key={h.hour} className="flex h-full flex-1 flex-col justify-end">
              <div className={cn('w-full rounded-md', LEVEL_STYLE[h.level].height, LEVEL_STYLE[h.level].bar)} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5 text-[10px] text-muted-foreground sm:text-xs" aria-hidden="true">
          {hours.map((h, i) => (
            <span key={h.hour} className="flex-1 text-center">
              {i % 2 === 0 ? formatHour(h.hour).replace(' ', '') : ''}
            </span>
          ))}
        </div>

        <ul className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
          {Object.values(LEVEL_STYLE).map((s) => (
            <li key={s.label} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-sm', s.bar)} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>

        <table className="sr-only">
          <caption>Estimated sensory intensity by hour</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Estimated intensity</th>
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h.hour}>
                <td>{formatHour(h.hour)}</td>
                <td>{LEVEL_STYLE[h.level].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
