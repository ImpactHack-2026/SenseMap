import type { DataSource, PlaceInfo, SensoryProfile } from '@/lib/types'
import { googleMapsUrl } from '@/lib/sensory'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { FACTOR_ICONS, FACTOR_NAMES } from '@/components/sensory/factors'

export function EvidenceList({
  sensory,
  place,
  source,
  defaultOpen = [],
}: {
  sensory: SensoryProfile
  place: PlaceInfo
  source: DataSource
  /** Evidence item ids rendered open on first paint (e.g. deep links). */
  defaultOpen?: string[]
}) {
  const isDemo = sensory.method === 'demo-curated'
  const isGoogle = source === 'google'
  const sourceUrl = googleMapsUrl(place)
  return (
    <section aria-labelledby="evidence-heading">
      <h2 id="evidence-heading" className="font-serif text-2xl font-medium tracking-tight">
        Why this score?
      </h2>
      <p className="mt-2 text-muted-foreground">
        The review patterns behind each estimate.
        {isGoogle
          ? ' Excerpts come from the sample of up to five reviews Google returns for this place, each linked to its source.'
          : ''}
        {isDemo ? ' These excerpts are illustrative examples for the demo, not real customer reviews.' : ''}
      </p>

      {sensory.evidence.length ? (
        <Accordion multiple defaultValue={defaultOpen} className="mt-5 rounded-2xl border border-border bg-card px-5">
          {sensory.evidence.map((item) => {
            const Icon = FACTOR_ICONS[item.factor]
            return (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className="gap-3 py-4 text-left hover:no-underline">
                  <span className="flex items-start gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <span className="block font-medium">{item.statement}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {FACTOR_NAMES[item.factor]} · mentioned in {item.mentions}{' '}
                        {item.mentions === 1 ? 'review' : 'reviews'}
                      </span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="flex flex-col gap-3 pb-2 pl-7">
                    {item.excerpts.map((ex, i) => (
                      <li key={i}>
                        <blockquote className="border-l-2 border-primary/30 pl-4 text-sm leading-relaxed text-foreground/85">
                          {`“${ex.text}”`}
                        </blockquote>
                        <p className="mt-1 pl-4 text-xs text-muted-foreground">
                          {ex.kind === 'illustrative' ? (
                            'Illustrative excerpt'
                          ) : (
                            <>
                              {[[ex.author, ex.relativeTime].filter(Boolean).join(' · ')].filter(Boolean).join('')}
                              {ex.author || ex.relativeTime ? ' · ' : ''}
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-2 hover:text-foreground"
                              >
                                via Google
                                <span className="sr-only">— opens the source listing in a new tab</span>
                              </a>
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          Not enough review evidence yet to explain these estimates in detail.
        </p>
      )}
    </section>
  )
}
