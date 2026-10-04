import { Database, Info, Sparkles, Star } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONFIDENCE_LABELS, scoreLabel, scoreTone, type Tone } from '@/lib/sensory'
import type { Confidence, DataSource } from '@/lib/types'

const TONE_CLASSES: Record<Tone, { soft: string; dot: string; text: string }> = {
  calm: { soft: 'bg-calm-soft text-foreground', dot: 'bg-calm', text: 'text-calm' },
  moderate: { soft: 'bg-moderate-soft text-foreground', dot: 'bg-moderate', text: 'text-moderate' },
  intense: { soft: 'bg-intense-soft text-foreground', dot: 'bg-intense', text: 'text-intense' },
}

export function toneClasses(tone: Tone) {
  return TONE_CLASSES[tone]
}

/** A sensory attribute pill. Always shows an icon, the factor name, and a text level — never color alone. */
export function FactorPill({
  icon: Icon,
  name,
  value,
  tone,
  className,
}: {
  icon: LucideIcon
  name: string
  value: string
  tone: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        TONE_CLASSES[tone].soft,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      <span className="text-muted-foreground">{name}:</span>
      <span>{value}</span>
    </span>
  )
}

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'md' | 'lg' }) {
  const tone = scoreTone(score)
  const radius = size === 'lg' ? 34 : 22
  const stroke = size === 'lg' ? 6 : 4.5
  const box = (radius + stroke) * 2
  const circumference = 2 * Math.PI * radius
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: box, height: box }}>
        <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="-rotate-90" aria-hidden="true">
          <circle cx={box / 2} cy={box / 2} r={radius} strokeWidth={stroke} className="fill-none stroke-muted" />
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - score / 100)}
            className={cn('fill-none', {
              'stroke-calm': tone === 'calm',
              'stroke-moderate': tone === 'moderate',
              'stroke-intense': tone === 'intense',
            })}
          />
        </svg>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center font-semibold tabular-nums',
            size === 'lg' ? 'text-2xl' : 'text-sm',
          )}
        >
          {score}
        </span>
      </div>
      <div className="leading-tight">
        <p className={cn('font-medium', size === 'lg' ? 'text-base' : 'text-xs')}>SenseMap Score</p>
        <p className={cn('text-muted-foreground', size === 'lg' ? 'text-sm' : 'text-xs')}>{scoreLabel(score)}</p>
      </div>
      <span className="sr-only">
        SenseMap Score {score} out of 100, {scoreLabel(score)}. This is a SenseMap estimate, not a Google rating.
      </span>
    </div>
  )
}

export function GoogleRating({ rating, count }: { rating: number | null; count: number }) {
  if (rating == null) return <span className="text-xs text-muted-foreground">No Google rating</span>
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="size-3.5 fill-current" aria-hidden="true" />
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
      <span>
        Google · {count.toLocaleString()} reviews
      </span>
    </span>
  )
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const tone: Tone = confidence === 'high' ? 'calm' : confidence === 'medium' ? 'moderate' : 'intense'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('size-1.5 rounded-full', TONE_CLASSES[tone].dot)} aria-hidden="true" />
      {CONFIDENCE_LABELS[confidence]}
    </span>
  )
}

export function DataSourceBadge({ source, className }: { source: DataSource; className?: string }) {
  const Icon = source === 'google' ? Database : Info
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {source === 'google' ? 'Live Google Places data' : 'Demo data — fictional Fremont restaurants'}
    </span>
  )
}

export function EstimateLabel({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <Sparkles className="size-3.5" aria-hidden="true" />
      SenseMap estimate
    </span>
  )
}
