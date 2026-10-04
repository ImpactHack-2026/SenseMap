import type { SensoryProfile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { TONE_TEXT } from '@/lib/sensory'
import { factorViews } from '@/components/sensory/factors'
import { ConfidenceBadge, EstimateLabel, toneClasses } from '@/components/sensory/primitives'

export function FactorGrid({ sensory }: { sensory: SensoryProfile }) {
  const factors = factorViews(sensory)
  return (
    <section aria-labelledby="factors-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="factors-heading" className="font-serif text-2xl font-medium tracking-tight">
          Sensory profile
        </h2>
        <EstimateLabel />
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {factors.map((f) => {
          const tone = toneClasses(f.tone)
          return (
            <li key={f.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={cn('flex size-10 items-center justify-center rounded-xl', tone.soft)}>
                    <f.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm text-muted-foreground">{f.name}</h3>
                    <p className="font-medium">{f.value}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn('size-2 rounded-full', tone.dot)} aria-hidden="true" />
                  {TONE_TEXT[f.tone]}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80">{f.summary}</p>
              <ConfidenceBadge confidence={f.confidence} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
