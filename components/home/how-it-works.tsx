import { FileSearch, Quote, SlidersHorizontal } from 'lucide-react'
import { FACTOR_ICONS, FACTOR_NAMES } from '@/components/sensory/factors'

const STEPS = [
  {
    icon: FileSearch,
    title: 'We read the reviews',
    body: 'SenseMap looks for patterns in public reviews — mentions of noise, lighting, crowds, smells, and seating.',
  },
  {
    icon: SlidersHorizontal,
    title: 'We estimate the environment',
    body: 'Each factor gets a plain-language estimate and a confidence level, so you know how much evidence is behind it.',
  },
  {
    icon: Quote,
    title: 'We show our work',
    body: 'Every estimate links to the review excerpts that support it. No black boxes, no guessing.',
  },
]

const FACTORS = ['noise', 'lighting', 'crowding', 'smell', 'seating', 'timing'] as const

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 id="how-heading" className="font-serif text-3xl font-medium tracking-tight">
        How SenseMap works
      </h2>
      <ol className="mt-8 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <step.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm text-muted-foreground">Step {i + 1}</span>
            </div>
            <h3 className="mt-4 text-lg font-medium">{step.title}</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 rounded-2xl bg-secondary p-6 sm:p-8">
        <h3 className="text-lg font-medium">What we look at</h3>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {FACTORS.map((key) => {
            const Icon = FACTOR_ICONS[key]
            return (
              <li key={key} className="flex items-center gap-2 rounded-xl bg-card px-3 py-3 text-sm font-medium">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {key === 'timing' ? 'Best times' : FACTOR_NAMES[key]}
              </li>
            )
          })}
        </ul>
        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          SenseMap estimates are generated from public reviews and may not reflect every visit. Sensory conditions can
          change by day, time, and event. SenseMap does not diagnose, treat, or make medical claims.
        </p>
      </div>
    </section>
  )
}
