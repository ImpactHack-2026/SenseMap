import type {
  Confidence,
  CrowdingLevel,
  EvidenceItem,
  HourlyEstimate,
  IntensityLevel,
  LightingLevel,
  NoiseLevel,
  ReviewExcerpt,
  SeatingOption,
  SensoryProfile,
  SmellLevel,
  TimeWindow,
} from '../types'

/**
 * SenseMap analysis v1: transparent keyword-pattern scoring over review text.
 * Every factor is derived from cited excerpts, so the "Why this score?" UI
 * can always point to the exact reviews that produced it.
 * Designed to be swapped for an LLM-based analyzer that returns the same shape.
 */

export interface ReviewInput {
  text: string
  author?: string
  relativeTime?: string
}

export interface PlaceSignals {
  outdoorSeating?: boolean
  types?: string[]
}

type Lexicon = { calm: RegExp; intense: RegExp }

const LEX: Record<'noise' | 'lighting' | 'crowding' | 'smell', Lexicon> = {
  noise: {
    calm: /\b(quiet|peaceful|calm|relaxing|serene|hushed|easy to talk|could hear each other)\b/i,
    intense: /\b(loud|noisy|blaring|shouting|deafening|can'?t hear|music was too)\b/i,
  },
  lighting: {
    calm: /\b(dim|soft light|candle|cozy lighting|warm lighting|moody|low light)\b/i,
    intense: /\b(bright|fluorescent|harsh light|glare|tvs?|screens)\b/i,
  },
  crowding: {
    calm: /\b(empty|not busy|uncrowded|no wait|plenty of seating|spacious|had the place)\b/i,
    intense: /\b(packed|crowded|busy|long line|long wait|line out|cramped|jammed)\b/i,
  },
  smell: {
    calm: /\b(no smell|fresh air|clean smell)\b/i,
    intense: /\b(smoky|smoke|greasy smell|strong smell|aroma|smelled|fried smell|incense)\b/i,
  },
}

const SEATING_LEX: Record<SeatingOption, RegExp> = {
  'quiet-seating': /\b(quiet (corner|table|area|spot)|back room|tucked away)\b/i,
  booths: /\bbooths?\b/i,
  outdoor: /\b(patio|outdoor|outside seating|terrace)\b/i,
  private: /\b(private room|private dining|secluded)\b/i,
}

const FACTOR_LABEL = { noise: 'noise', lighting: 'lighting', crowding: 'crowds', smell: 'smells' } as const

function toExcerpt(r: ReviewInput, match: RegExp): ReviewExcerpt {
  const sentence =
    r.text.split(/(?<=[.!?])\s+/).find((s) => match.test(s)) ?? r.text.slice(0, 180)
  return { text: sentence.trim().slice(0, 220), kind: 'google-review', author: r.author, relativeTime: r.relativeTime }
}

function confidenceFor(mentions: number): Confidence {
  if (mentions >= 4) return 'high'
  if (mentions >= 2) return 'medium'
  return 'limited'
}

/** Returns a balance in [-1, 1]: negative = calmer, positive = more intense. */
function balance(calm: number, intense: number) {
  const total = calm + intense
  return total === 0 ? 0 : (intense - calm) / total
}

export function analyzeReviews(reviews: ReviewInput[], signals: PlaceSignals = {}): SensoryProfile {
  const evidence: EvidenceItem[] = []
  const stats: Record<keyof typeof LEX, { calm: ReviewInput[]; intense: ReviewInput[] }> = {
    noise: { calm: [], intense: [] },
    lighting: { calm: [], intense: [] },
    crowding: { calm: [], intense: [] },
    smell: { calm: [], intense: [] },
  }

  for (const review of reviews) {
    for (const key of Object.keys(LEX) as (keyof typeof LEX)[]) {
      if (LEX[key].calm.test(review.text)) stats[key].calm.push(review)
      if (LEX[key].intense.test(review.text)) stats[key].intense.push(review)
    }
  }

  for (const key of Object.keys(LEX) as (keyof typeof LEX)[]) {
    const { calm, intense } = stats[key]
    if (calm.length) {
      evidence.push({
        id: `${key}-calm`,
        factor: key,
        statement: `${calm.length} review${calm.length > 1 ? 's' : ''} describe${calm.length === 1 ? 's' : ''} calmer ${FACTOR_LABEL[key]}.`,
        mentions: calm.length,
        excerpts: calm.slice(0, 3).map((r) => toExcerpt(r, LEX[key].calm)),
      })
    }
    if (intense.length) {
      evidence.push({
        id: `${key}-intense`,
        factor: key,
        statement: `${intense.length} review${intense.length > 1 ? 's' : ''} mention${intense.length === 1 ? 's' : ''} more intense ${FACTOR_LABEL[key]}.`,
        mentions: intense.length,
        excerpts: intense.slice(0, 3).map((r) => toExcerpt(r, LEX[key].intense)),
      })
    }
  }

  const b = {
    noise: balance(stats.noise.calm.length, stats.noise.intense.length),
    lighting: balance(stats.lighting.calm.length, stats.lighting.intense.length),
    crowding: balance(stats.crowding.calm.length, stats.crowding.intense.length),
    smell: balance(stats.smell.calm.length, stats.smell.intense.length),
  }
  const mentions = (k: keyof typeof LEX) => stats[k].calm.length + stats[k].intense.length

  const noiseLevel: NoiseLevel =
    b.noise <= -0.6 ? 'very-quiet' : b.noise < 0 ? 'quiet' : b.noise >= 0.5 ? 'loud' : 'moderate'
  const lightingLevel: LightingLevel =
    b.lighting <= -0.5 ? 'dim' : b.lighting < 0 ? 'soft' : b.lighting >= 0.5 ? 'bright' : 'moderate'
  const crowdingLevel: CrowdingLevel = b.crowding < -0.2 ? 'low' : b.crowding >= 0.4 ? 'high' : 'moderate'
  const smellLevel: SmellLevel = b.smell >= 0.5 ? 'strong' : b.smell < 0 ? 'low' : 'moderate'

  const seatingOptions = (Object.keys(SEATING_LEX) as SeatingOption[]).filter((opt) =>
    reviews.some((r) => SEATING_LEX[opt].test(r.text)),
  )
  if (signals.outdoorSeating && !seatingOptions.includes('outdoor')) seatingOptions.push('outdoor')

  const avg = (b.noise * 1.4 + b.lighting * 0.8 + b.crowding * 1.2 + b.smell * 0.6) / 4
  const senseMapScore = Math.round(Math.min(96, Math.max(12, 62 - avg * 45)))
  const intensity: IntensityLevel = senseMapScore >= 72 ? 'low' : senseMapScore >= 50 ? 'moderate' : 'high'

  const isBar = signals.types?.some((t) => /bar|night_club|pub/.test(t))
  const isCafe = signals.types?.some((t) => /cafe|bakery|coffee|breakfast/.test(t))
  const bestTimes: HourlyEstimate[] = Array.from({ length: 14 }, (_, i) => {
    const hour = 8 + i
    const peak = (hour >= 12 && hour <= 13) || (hour >= 18 && hour <= 20) || (isCafe && hour >= 8 && hour <= 10)
    const late = isBar && hour >= 20
    const level: IntensityLevel =
      late || (peak && crowdingLevel === 'high') ? 'high' : peak ? 'moderate' : crowdingLevel === 'high' ? 'moderate' : 'low'
    return { hour, level }
  })
  const bestWindows: TimeWindow[] = isCafe ? ['afternoon'] : ['afternoon', 'late-evening']

  const totalMentions = (Object.keys(LEX) as (keyof typeof LEX)[]).reduce((s, k) => s + mentions(k), 0)
  const overall = confidenceFor(Math.floor(totalMentions / 2))
  const limited = 'More evidence is needed to confidently estimate this factor.'

  const summaryFor = (k: keyof typeof LEX, calmText: string, intenseText: string) =>
    mentions(k) === 0 ? limited : b[k] <= 0 ? calmText : intenseText

  return {
    senseMapScore,
    noise: {
      level: noiseLevel,
      label: noiseLevel === 'very-quiet' ? 'Very quiet' : noiseLevel[0].toUpperCase() + noiseLevel.slice(1),
      summary: summaryFor('noise', 'Reviews lean toward a calm, conversational environment.', 'Reviews mention noticeable noise.'),
      confidence: confidenceFor(mentions('noise')),
    },
    lighting: {
      level: lightingLevel,
      label: lightingLevel[0].toUpperCase() + lightingLevel.slice(1),
      summary: summaryFor('lighting', 'Lighting is described as soft or warm.', 'Reviews mention bright lighting or screens.'),
      confidence: confidenceFor(mentions('lighting')),
    },
    crowding: {
      level: crowdingLevel,
      label: `Usually ${crowdingLevel}`,
      summary: summaryFor('crowding', 'Reviews suggest it is often not crowded.', 'Reviews mention waits or busy periods.'),
      confidence: confidenceFor(mentions('crowding')),
    },
    smell: {
      level: smellLevel,
      label: smellLevel[0].toUpperCase() + smellLevel.slice(1),
      summary: summaryFor('smell', 'Few strong smells are mentioned.', 'Reviews mention noticeable cooking smells.'),
      confidence: confidenceFor(mentions('smell')),
    },
    seating: {
      options: seatingOptions,
      label: seatingOptions.length ? 'Seating options mentioned' : 'Unknown',
      summary: seatingOptions.length ? 'Seating types referenced in reviews or listing details.' : limited,
      confidence: seatingOptions.length ? 'medium' : 'limited',
    },
    sensoryIntensity: {
      level: intensity,
      label: intensity[0].toUpperCase() + intensity.slice(1),
      summary: 'Combined estimate across noise, lighting, crowding, and smell.',
      confidence: overall,
    },
    bestTimes,
    bestWindows,
    bestTimeLabel: isCafe ? 'Likely calmer after 2 PM' : 'Likely calmer mid-afternoon',
    evidence,
    confidence: overall,
    analyzedReviewCount: reviews.length,
    method: 'review-keyword-v1',
    analyzedAt: new Date().toISOString(),
  }
}
