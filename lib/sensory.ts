import type {
  Confidence,
  CrowdingLevel,
  IntensityLevel,
  LightingLevel,
  NoiseLevel,
  Restaurant,
  RestaurantFilters,
  SeatingOption,
  SmellLevel,
  TimeWindow,
} from './types'

export const FREMONT_CENTER = { latitude: 37.5485, longitude: -121.9886 }

export const NOISE_LABELS: Record<NoiseLevel, string> = {
  'very-quiet': 'Very quiet',
  quiet: 'Quiet',
  moderate: 'Moderate',
  loud: 'Loud',
}
export const LIGHTING_LABELS: Record<LightingLevel, string> = {
  dim: 'Dim',
  soft: 'Soft',
  moderate: 'Moderate',
  bright: 'Bright',
}
export const CROWDING_LABELS: Record<CrowdingLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
}
export const SMELL_LABELS: Record<SmellLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  strong: 'Strong',
}
export const INTENSITY_LABELS: Record<IntensityLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
}
export const SEATING_LABELS: Record<SeatingOption, string> = {
  'quiet-seating': 'Quiet seating',
  booths: 'Booths',
  outdoor: 'Outdoor seating',
  private: 'Private / secluded',
}
export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  morning: 'Morning',
  lunch: 'Lunch',
  afternoon: 'Afternoon',
  dinner: 'Dinner',
  'late-evening': 'Late evening',
}
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  limited: 'Limited evidence',
}

/** Tone maps every level onto a calm/moderate/intense scale for consistent color + text. */
export type Tone = 'calm' | 'moderate' | 'intense'

export function noiseTone(level: NoiseLevel): Tone {
  return level === 'loud' ? 'intense' : level === 'moderate' ? 'moderate' : 'calm'
}
export function lightingTone(level: LightingLevel): Tone {
  return level === 'bright' ? 'intense' : level === 'moderate' ? 'moderate' : 'calm'
}
export function threeTone(level: CrowdingLevel | SmellLevel | IntensityLevel): Tone {
  if (level === 'low') return 'calm'
  if (level === 'moderate') return 'moderate'
  return 'intense'
}

export function scoreTone(score: number): Tone {
  if (score >= 70) return 'calm'
  if (score >= 50) return 'moderate'
  return 'intense'
}

export function scoreLabel(score: number): string {
  if (score >= 80) return 'Lower sensory intensity'
  if (score >= 65) return 'Low–moderate sensory intensity'
  if (score >= 50) return 'Moderate sensory intensity'
  return 'Higher sensory intensity'
}

export const TONE_TEXT: Record<Tone, string> = {
  calm: 'Calmer',
  moderate: 'Moderate',
  intense: 'More intense',
}

export function formatHour(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${suffix}`
}

export function distanceMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 3958.8
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const EMPTY_FILTERS: RestaurantFilters = {
  query: '',
  noise: [],
  lighting: [],
  crowding: [],
  smell: [],
  seating: [],
  intensity: [],
  bestTime: [],
}

export function activeFilterCount(f: RestaurantFilters): number {
  return (
    f.noise.length +
    f.lighting.length +
    f.crowding.length +
    f.smell.length +
    f.seating.length +
    f.intensity.length +
    f.bestTime.length
  )
}

export function applyFilters(restaurants: Restaurant[], f: RestaurantFilters): Restaurant[] {
  const q = f.query.trim().toLowerCase()
  return restaurants.filter(({ place, sensory }) => {
    if (q) {
      const haystack = [place.name, place.cuisine, place.neighborhood, place.address, ...place.categories]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (f.noise.length && !f.noise.includes(sensory.noise.level)) return false
    if (f.lighting.length && !f.lighting.includes(sensory.lighting.level)) return false
    if (f.crowding.length && !f.crowding.includes(sensory.crowding.level)) return false
    if (f.smell.length && !f.smell.includes(sensory.smell.level)) return false
    if (f.intensity.length && !f.intensity.includes(sensory.sensoryIntensity.level)) return false
    if (f.seating.length && !f.seating.every((s) => sensory.seating.options.includes(s))) return false
    if (f.bestTime.length && !f.bestTime.some((t) => sensory.bestWindows.includes(t))) return false
    return true
  })
}

/** Quick presets used by the homepage chips; each maps to a filter combination. */
export const PRESETS = {
  quiet: { label: 'Quiet', filters: { noise: ['very-quiet', 'quiet'] } },
  'low-lighting': { label: 'Low lighting', filters: { lighting: ['dim', 'soft'] } },
  'less-crowded': { label: 'Less crowded', filters: { crowding: ['low'] } },
  'low-sensory': { label: 'Low sensory', filters: { intensity: ['low'] } },
  'quiet-seating': { label: 'Quiet seating', filters: { seating: ['quiet-seating'] } },
} as const satisfies Record<string, { label: string; filters: Partial<RestaurantFilters> }>

export type PresetKey = keyof typeof PRESETS

export function filtersFromPreset(key: string | undefined, query = ''): RestaurantFilters {
  const preset = key && key in PRESETS ? PRESETS[key as PresetKey] : undefined
  return { ...EMPTY_FILTERS, query, ...(preset?.filters as Partial<RestaurantFilters>) }
}
