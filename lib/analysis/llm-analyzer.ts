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
 * LLM-powered review analysis.
 *
 * Turns raw review text into the same `SensoryProfile` shape as the keyword
 * analyzer (`review-keyword-v1`), using whichever AI provider is configured:
 *
 *   - Gemini            → GEMINI_API_KEY            (AI_PROVIDER=gemini to force)
 *   - Grok (xAI)        → XAI_API_KEY / GROK_API_KEY (AI_PROVIDER=grok)
 *   - OpenAI-compatible → OPENAI_API_KEY (+ optional OPENAI_BASE_URL, OPENAI_MODEL)
 *
 * AI_PROVIDER=off disables LLM analysis entirely. The caller
 * (`lib/analysis/index.ts`) falls back to the transparent keyword analyzer
 * whenever no provider is configured or the LLM call fails.
 *
 * The model's JSON is never trusted blindly: `coerceLLMProfile` validates
 * every field, verifies evidence excerpts are verbatim substrings of real
 * reviews, and throws on anything malformed so the caller can fall back.
 */

export const MAX_REVIEWS = 40
export const MAX_REVIEW_CHARS = 500
const TIMEOUT_MS = 60_000

export interface ReviewInput {
  text: string
  author?: string
  relativeTime?: string
}

export interface PlaceSignals {
  outdoorSeating?: boolean
  types?: string[]
}

export type AIProviderKind = 'gemini' | 'grok' | 'openai' | 'none'

export interface AIProvider {
  kind: AIProviderKind
  model: string
  baseUrl?: string
  label: string
}

const NONE: AIProvider = { kind: 'none', model: '', label: 'not configured' }

/**
 * Picks the AI provider. `AI_PROVIDER` forces one; `auto` (default) uses the
 * first key that is present: Gemini → Grok → OpenAI-compatible.
 */
export function resolveAIProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  const pref = (env.AI_PROVIDER ?? 'auto').toLowerCase().trim()

  const geminiModel = env.GEMINI_MODEL || 'gemini-2.5-flash'
  const grokModel = env.XAI_MODEL || 'grok-4-fast'
  const openaiModel = env.OPENAI_MODEL || 'gpt-4o-mini'

  const gemini = {
    kind: 'gemini' as const,
    model: geminiModel,
    label: `Gemini (${geminiModel})`,
  }
  const grok = {
    kind: 'grok' as const,
    model: grokModel,
    baseUrl: (env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/+$/, ''),
    label: `Grok (${grokModel})`,
  }
  const openai = {
    kind: 'openai' as const,
    model: openaiModel,
    baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    label: `OpenAI-compatible (${openaiModel})`,
  }

  const available = { gemini, grok, openai } as const
  const keyFor = {
    gemini: env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY,
    grok: env.XAI_API_KEY ?? env.GROK_API_KEY,
    openai: env.OPENAI_API_KEY,
  } as const

  if (['off', 'none', 'disabled', 'keyword'].includes(pref)) return NONE
  if (pref === 'gemini' || pref === 'grok' || pref === 'openai') {
    return keyFor[pref] ? available[pref] : NONE
  }

  if (keyFor.gemini) return gemini
  if (keyFor.grok) return grok
  if (keyFor.openai) return openai
  return NONE
}

const SYSTEM_PROMPT = `You analyze public restaurant and cafe reviews for SenseMap, an accessibility tool that estimates how calm and predictable a venue's sensory environment is for neurodivergent guests, people with sensory processing differences, migraines, or anxiety.

From ONLY what the reviews say, estimate:
- noise: "very-quiet" | "quiet" | "moderate" | "loud"
- lighting: "dim" | "soft" | "moderate" | "bright"
- crowding: "low" | "moderate" | "high"
- smell: "low" | "moderate" | "strong"
- sensoryIntensity: "low" | "moderate" | "high" (overall combined impression)
- seating: subset of ["quiet-seating", "booths", "outdoor", "private"]

Rules:
- senseMapScore: integer 0-100 estimating overall sensory friendliness. HIGHER means calmer and easier on the senses; LOWER means more intense. Weight noise most, then crowding, then lighting, then smell.
- confidence for each factor and overall: "high" (many reviews agree), "medium" (a few), "limited" (barely or not mentioned). Never present a guess as fact.
- summaries: one plain-language sentence based only on review evidence.
- evidence: the strongest review patterns. Each statement is a plain description; each excerpt MUST be copied VERBATIM as a contiguous substring of one numbered review, with that review's number in reviewNumber. Never paraphrase, merge, or invent excerpts.
- bestTimes: expected intensity ("low"|"moderate"|"high") for each hour from 8 to 21. Use what reviews say about busy times; if they say little, use typical restaurant patterns (lunch and dinner peaks, cafe morning peaks).
- bestWindows: up to 2 of ["morning", "lunch", "afternoon", "dinner", "late-evening"] that reviews suggest are calmest.
- bestTimeLabel: one short phrase like "Weekday afternoons are usually calmest".
- If reviews barely mention a factor, still give your best neutral estimate but set that factor's confidence to "limited" and say so in its summary.

Respond with ONLY a JSON object, no markdown, exactly this shape:
{
  "senseMapScore": <number>,
  "noise": { "level": "...", "summary": "...", "confidence": "..." },
  "lighting": { "level": "...", "summary": "...", "confidence": "..." },
  "crowding": { "level": "...", "summary": "...", "confidence": "..." },
  "smell": { "level": "...", "summary": "...", "confidence": "..." },
  "sensoryIntensity": { "level": "...", "summary": "...", "confidence": "..." },
  "seating": { "options": ["..."], "summary": "...", "confidence": "..." },
  "bestTimes": [{ "hour": 8, "level": "low" }],
  "bestWindows": ["afternoon"],
  "bestTimeLabel": "...",
  "evidence": [
    { "factor": "noise|lighting|crowding|smell|seating|timing", "statement": "...", "mentions": <number>, "excerpts": [{ "reviewNumber": 1, "text": "..." }] }
  ]
}`

export function buildAnalysisPrompt(
  placeName: string,
  reviews: ReviewInput[],
  signals: PlaceSignals = {},
): { system: string; user: string } {
  const context = [
    `Venue: ${placeName}`,
    signals.types?.length ? `Venue types: ${signals.types.join(', ')}` : '',
    signals.outdoorSeating ? 'Venue listing says outdoor seating exists.' : '',
  ]
    .filter(Boolean)
    .join('\n')

  const numbered = reviews
    .slice(0, MAX_REVIEWS)
    .map((r, i) => `Review ${i + 1}${r.author ? ` by ${r.author}` : ''}: "${r.text.slice(0, MAX_REVIEW_CHARS).replace(/\s+/g, ' ').trim()}"`)
    .join('\n\n')

  return { system: SYSTEM_PROMPT, user: `${context}\n\nPublic reviews to analyze:\n\n${numbered}` }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

async function callGemini(provider: AIProvider, system: string, user: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? ''
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Gemini API error ${res.status}`)
  let data: GeminiResponse
  try {
    data = (await res.json()) as GeminiResponse
  } catch {
    // Fixed message: JSON parse errors can quote the response body, which
    // may contain review text (docs/DATA_POLICY.md D7).
    throw new Error('Gemini returned a non-JSON response')
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
  if (!text) throw new Error('Gemini returned no content')
  return text
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[]
}

async function callOpenAICompatible(provider: AIProvider, system: string, user: string): Promise<string> {
  const key =
    provider.kind === 'grok'
      ? (process.env.XAI_API_KEY ?? process.env.GROK_API_KEY ?? '')
      : (process.env.OPENAI_API_KEY ?? '')
  const res = await fetch(`${provider.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`AI API error ${res.status} (${provider.label})`)
  let data: OpenAIChatResponse
  try {
    data = (await res.json()) as OpenAIChatResponse
  } catch {
    // Fixed message: JSON parse errors can quote the response body, which
    // may contain review text (docs/DATA_POLICY.md D7).
    throw new Error('AI returned a non-JSON response')
  }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('AI returned no content')
  return text
}

/** Tolerant JSON extraction: strips code fences and surrounding prose. */
export function parseLLMJson(text: string): unknown {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found in model output')
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    // V8's parse errors quote the input, and model output can contain review
    // text — logs must never retain it (docs/DATA_POLICY.md D7 / §4 gap).
    throw new Error('Model output was not valid JSON')
  }
}

// ---------------------------------------------------------------------------
// Strict coercion: the LLM output is treated as untrusted input.
// ---------------------------------------------------------------------------

const NOISE_LEVELS: NoiseLevel[] = ['very-quiet', 'quiet', 'moderate', 'loud']
const LIGHTING_LEVELS: LightingLevel[] = ['dim', 'soft', 'moderate', 'bright']
const CROWDING_LEVELS: CrowdingLevel[] = ['low', 'moderate', 'high']
const SMELL_LEVELS: SmellLevel[] = ['low', 'moderate', 'strong']
const INTENSITY_LEVELS: IntensityLevel[] = ['low', 'moderate', 'high']
const SEATING_OPTIONS: SeatingOption[] = ['quiet-seating', 'booths', 'outdoor', 'private']
const TIME_WINDOWS: TimeWindow[] = ['morning', 'lunch', 'afternoon', 'dinner', 'late-evening']
const CONFIDENCES: Confidence[] = ['high', 'medium', 'limited']
const EVIDENCE_FACTORS = ['noise', 'lighting', 'crowding', 'smell', 'seating', 'timing'] as const

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new Error('senseMapScore missing or not a number')
  return Math.min(99, Math.max(1, Math.round(n)))
}

/** Same baseline curve as the keyword analyzer, used when the model omits bestTimes. */
function hourlyCurve(crowding: CrowdingLevel, opts: { cafe?: boolean; bar?: boolean } = {}): HourlyEstimate[] {
  const out: HourlyEstimate[] = []
  for (let hour = 8; hour <= 21; hour++) {
    const peak = (hour >= 12 && hour <= 13) || (hour >= 18 && hour <= 20) || (opts.cafe === true && hour >= 8 && hour <= 10)
    const late = opts.bar === true && hour >= 20
    const level: IntensityLevel =
      late || (peak && crowding === 'high') ? 'high' : peak ? 'moderate' : crowding === 'high' ? 'moderate' : 'low'
    out.push({ hour, level })
  }
  return out
}

export function coerceLLMProfile(raw: unknown, reviews: ReviewInput[], signals: PlaceSignals = {}): SensoryProfile {
  if (!isObj(raw)) throw new Error('Model output is not a JSON object')

  const factor = <L extends string>(allowed: readonly L[], key: string, defaultLabel: (l: L) => string) => {
    const f = isObj(raw[key]) ? raw[key] : null
    const level = f ? oneOf(f.level, allowed) : null
    if (!level) throw new Error(`Factor "${key}" missing or has invalid level`)
    return {
      level,
      label: defaultLabel(level),
      summary: (f && asString(f.summary)) ?? 'Estimated from review text with limited evidence.',
      confidence: (f ? oneOf(f.confidence, CONFIDENCES) : null) ?? 'limited',
    }
  }

  const noise = factor<NoiseLevel>(NOISE_LEVELS, 'noise', (l) => (l === 'very-quiet' ? 'Very quiet' : l[0].toUpperCase() + l.slice(1)))
  const lighting = factor<LightingLevel>(LIGHTING_LEVELS, 'lighting', (l) => l[0].toUpperCase() + l.slice(1))
  const crowding = factor<CrowdingLevel>(CROWDING_LEVELS, 'crowding', (l) => `Usually ${l}`)
  const smell = factor<SmellLevel>(SMELL_LEVELS, 'smell', (l) => l[0].toUpperCase() + l.slice(1))
  const intensity = factor<IntensityLevel>(INTENSITY_LEVELS, 'sensoryIntensity', (l) => l[0].toUpperCase() + l.slice(1))

  // Seating: drop anything the model invented; keep only valid options.
  const seatingRaw = isObj(raw.seating) ? raw.seating : {}
  const seatingOptions = Array.isArray(seatingRaw.options)
    ? [...new Set(seatingRaw.options.filter((o): o is SeatingOption => oneOf(o, SEATING_OPTIONS) !== null))]
    : []
  if (signals.outdoorSeating && !seatingOptions.includes('outdoor')) seatingOptions.push('outdoor')

  // Evidence: verify each excerpt is a verbatim substring of a real review.
  const normalizedReviews = reviews.map((r) => normalize(r.text))
  const evidence: EvidenceItem[] = []
  if (Array.isArray(raw.evidence)) {
    for (const item of raw.evidence.slice(0, 10)) {
      if (!isObj(item)) continue
      const statement = asString(item.statement)
      const factorKey = oneOf(item.factor, EVIDENCE_FACTORS)
      if (!statement || !factorKey) continue
      const excerpts: ReviewExcerpt[] = []
      if (Array.isArray(item.excerpts)) {
        for (const ex of item.excerpts.slice(0, 3)) {
          const text = isObj(ex) ? asString(ex.text) : null
          if (!text) continue
          const verbatim = normalizedReviews.some((reviewText) => reviewText.includes(normalize(text)))
          if (!verbatim) continue
          const sourceIdx = normalizedReviews.findIndex((reviewText) => reviewText.includes(normalize(text)))
          excerpts.push({
            text: text.slice(0, 220),
            kind: 'google-review',
            author: reviews[sourceIdx]?.author,
            relativeTime: reviews[sourceIdx]?.relativeTime,
          })
        }
      }
      evidence.push({
        id: `llm-${factorKey}-${evidence.length}`,
        factor: factorKey,
        statement: statement.slice(0, 240),
        mentions: Math.max(1, Math.round(Number(item.mentions)) || 1),
        excerpts,
      })
    }
  }

  const bestTimesRaw = Array.isArray(raw.bestTimes) ? raw.bestTimes : []
  const byHour = new Map<number, IntensityLevel>()
  for (const entry of bestTimesRaw) {
    if (!isObj(entry)) continue
    const hour = Math.round(Number(entry.hour))
    const level = oneOf(entry.level, INTENSITY_LEVELS)
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23 && level) byHour.set(hour, level)
  }
  let bestTimes: HourlyEstimate[] = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, level]) => ({ hour, level }))
  if (bestTimes.length < 8) {
    const types = signals.types ?? []
    bestTimes = hourlyCurve(crowding.level, {
      cafe: types.some((t) => /cafe|bakery|coffee|breakfast/i.test(t)),
      bar: types.some((t) => /bar|night_club|pub/i.test(t)),
    })
  }

  let bestWindows = Array.isArray(raw.bestWindows)
    ? [...new Set(raw.bestWindows.filter((w): w is TimeWindow => oneOf(w, TIME_WINDOWS) !== null))].slice(0, 2)
    : []
  if (!bestWindows.length) bestWindows = ['afternoon']

  const overallConfidence = oneOf(raw.confidence, CONFIDENCES) ?? 'limited'

  return {
    senseMapScore: clampScore(raw.senseMapScore),
    noise,
    lighting,
    crowding,
    smell,
    seating: {
      options: seatingOptions,
      label: seatingOptions.length ? 'Seating options mentioned' : 'Unknown',
      summary:
        (isObj(raw.seating) ? asString(raw.seating.summary) : null) ??
        (seatingOptions.length
          ? 'Seating types referenced in reviews or listing details.'
          : 'Reviews do not describe the seating layout.'),
      confidence: (isObj(raw.seating) ? oneOf(raw.seating.confidence, CONFIDENCES) : null) ?? 'limited',
    },
    sensoryIntensity: intensity,
    bestTimes,
    bestWindows,
    bestTimeLabel: asString(raw.bestTimeLabel) ?? 'Weekday afternoons are often calmest',
    evidence,
    confidence: overallConfidence,
    analyzedReviewCount: reviews.length,
    method: 'llm-v1',
    analyzedAt: new Date().toISOString(),
  }
}

/**
 * Runs LLM analysis end to end. Throws when no provider is configured, the
 * request fails, or the output is malformed — the caller then falls back to
 * the keyword analyzer.
 */
export async function analyzeReviewsWithAI(
  reviews: ReviewInput[],
  signals: PlaceSignals = {},
  placeName = 'This place',
): Promise<SensoryProfile> {
  const provider = resolveAIProvider()
  if (provider.kind === 'none') throw new Error('No AI provider configured (set GEMINI_API_KEY, XAI_API_KEY, or OPENAI_API_KEY)')

  const usable = reviews.filter((r) => typeof r.text === 'string' && r.text.trim().length > 0)
  if (usable.length === 0) throw new Error('No review text available to analyze')

  const { system, user } = buildAnalysisPrompt(placeName, usable, signals)
  const text = provider.kind === 'gemini' ? await callGemini(provider, system, user) : await callOpenAICompatible(provider, system, user)
  const profile = coerceLLMProfile(parseLLMJson(text), usable, signals)
  return { ...profile, aiProvider: provider.label }
}
