import 'server-only'
import type { SensoryProfile } from '../types'
import { analyzeReviews } from './analyze-reviews'
import { analyzeReviewsWithAI, resolveAIProvider, type PlaceSignals, type ReviewInput } from './llm-analyzer'

export type { PlaceSignals, ReviewInput }

/**
 * Chooses the best available analyzer:
 *   1. LLM analysis (Gemini / Grok / OpenAI-compatible) when a key is set.
 *   2. Transparent keyword analysis (`review-keyword-v1`) otherwise, or when
 *      the LLM fails for any reason.
 *
 * Both return the same `SensoryProfile` shape, so callers never branch on
 * which analyzer ran.
 */
export async function analyzeReviewsSmart(
  reviews: ReviewInput[],
  signals: PlaceSignals = {},
  placeName = 'This place',
): Promise<SensoryProfile> {
  const provider = resolveAIProvider()
  const hasText = reviews.some((r) => r.text.trim().length > 0)

  if (provider.kind !== 'none' && hasText) {
    try {
      const profile = await analyzeReviewsWithAI(reviews, signals, placeName)
      console.info(`[sensemap] analyzed ${reviews.length} reviews for "${placeName}" with ${provider.label}`)
      return profile
    } catch (error) {
      console.error(`[sensemap] AI analysis (${provider.label}) failed for "${placeName}", using keyword analyzer:`, error)
    }
  }

  return analyzeReviews(reviews, signals)
}
