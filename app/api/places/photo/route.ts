import { NextResponse, type NextRequest } from 'next/server'

/** Proxies Google Places photos so the API key never reaches the browser. */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!name || !apiKey || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) {
    return NextResponse.json({ error: 'Invalid photo request' }, { status: 400 })
  }

  // Known deviation from data-policy decision D3 (docs/DATA_POLICY.md):
  // Google content must not be cached beyond the current request — these
  // 24-hour caches are scheduled for removal in Phase 2.
  const upstream = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=1200&key=${apiKey}`,
    { next: { revalidate: 60 * 60 * 24 } },
  )
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Photo unavailable' }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
