import type {
  Confidence,
  CrowdingLevel,
  IntensityLevel,
  LightingLevel,
  NoiseLevel,
  PlaceInfo,
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
// Scoped to the review sample on purpose (docs/DATA_POLICY.md D6): Google
// returns at most five reviews per place, so a label must never imply the
// estimate rests on broad coverage of a venue's review history.
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High confidence (this review sample)',
  medium: 'Medium confidence (this review sample)',
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

/**
 * The Google Maps source URL for a place — every attribution link points
 * here so readers can reach the listing an excerpt or estimate came from
 * (docs/DATA_POLICY.md D2 / §2 row 3).
 */
export function googleMapsUrl(place: PlaceInfo): string {
  return (
    place.mapsUrl ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address}`)}`
  )
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

/**
 * Substring match over the place fields a query searches. Shared by the
 * browse filters here and the search route's demo branch, so typing the same
 * text yields the same matches in either mode.
 */
export function placeMatchesQuery(place: PlaceInfo, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [place.name, place.cuisine, place.neighborhood, place.address, ...place.categories]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

/**
 * Appends a new search page to existing results, keeping each Place ID once.
 * Chain branches are distinct places (their own Place IDs); duplicates can
 * only appear if a provider repeats an id across pages.
 */
export function mergeSearchResults(existing: PlaceInfo[], incoming: PlaceInfo[]): PlaceInfo[] {
  const seen = new Set(existing.map((p) => p.placeId))
  const merged = [...existing]
  for (const place of incoming) {
    if (seen.has(place.placeId)) continue
    seen.add(place.placeId)
    merged.push(place)
  }
  return merged
}

export function applyFilters(restaurants: Restaurant[], f: RestaurantFilters): Restaurant[] {
  return restaurants.filter(({ place, sensory }) => {
    if (!placeMatchesQuery(place, f.query)) return false
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
