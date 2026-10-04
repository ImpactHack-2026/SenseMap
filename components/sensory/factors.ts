import { Armchair, Clock, Gauge, Lightbulb, Users, Volume2, Wind } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { lightingTone, noiseTone, threeTone, type Tone } from '@/lib/sensory'
import type { Confidence, SensoryFactorKey, SensoryProfile } from '@/lib/types'

export const FACTOR_ICONS: Record<SensoryFactorKey | 'timing', LucideIcon> = {
  noise: Volume2,
  lighting: Lightbulb,
  crowding: Users,
  smell: Wind,
  seating: Armchair,
  intensity: Gauge,
  timing: Clock,
}

export const FACTOR_NAMES: Record<SensoryFactorKey | 'timing', string> = {
  noise: 'Noise',
  lighting: 'Lighting',
  crowding: 'Crowding',
  smell: 'Smell',
  seating: 'Seating',
  intensity: 'Sensory intensity',
  timing: 'Timing',
}

export interface FactorView {
  key: SensoryFactorKey
  name: string
  icon: LucideIcon
  value: string
  summary: string
  tone: Tone
  confidence: Confidence
}

export function factorViews(s: SensoryProfile): FactorView[] {
  return [
    { key: 'noise', value: s.noise.label, summary: s.noise.summary, tone: noiseTone(s.noise.level), confidence: s.noise.confidence },
    { key: 'lighting', value: s.lighting.label, summary: s.lighting.summary, tone: lightingTone(s.lighting.level), confidence: s.lighting.confidence },
    { key: 'crowding', value: s.crowding.label, summary: s.crowding.summary, tone: threeTone(s.crowding.level), confidence: s.crowding.confidence },
    { key: 'smell', value: s.smell.label, summary: s.smell.summary, tone: threeTone(s.smell.level), confidence: s.smell.confidence },
    {
      key: 'seating',
      value: s.seating.label,
      summary: s.seating.summary,
      tone: s.seating.options.length ? ('calm' as Tone) : ('moderate' as Tone),
      confidence: s.seating.confidence,
    },
    {
      key: 'intensity',
      value: s.sensoryIntensity.label,
      summary: s.sensoryIntensity.summary,
      tone: threeTone(s.sensoryIntensity.level),
      confidence: s.sensoryIntensity.confidence,
    },
  ].map((f) => ({ ...f, key: f.key as SensoryFactorKey, name: FACTOR_NAMES[f.key as SensoryFactorKey], icon: FACTOR_ICONS[f.key as SensoryFactorKey] }))
}
