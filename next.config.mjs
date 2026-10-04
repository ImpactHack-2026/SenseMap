/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Freebuff preview proxies the dev server through an e2b workspace host;
  // without this, Next.js blocks cross-origin dev assets from that host.
  allowedDevOrigins: ['**.e2b.app'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
