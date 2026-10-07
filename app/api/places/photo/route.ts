import { NextResponse, type NextRequest } from 'next/server'

/** Proxies Google Places photos so the API key never reaches the browser. */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!name || !apiKey || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) {
    return NextResponse.json({ error: 'Invalid photo request' }, { status: 400 })
  }

  // Google content is never cached beyond this request (docs/DATA_POLICY.md D3).
  let upstream: Response
  try {
    upstream = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=1200&key=${apiKey}`, {
      cache: 'no-store',
    })
  } catch (error) {
    // Message only: never log the request object or URL (the key lives in it).
    console.error('[sensemap] photo proxy fetch failed:', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json({ error: 'Photo unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Photo unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'no-store',
    },
  })
}
