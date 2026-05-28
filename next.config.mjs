/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_MOBILE_BUILD === 'true' ? { output: 'export' } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (process.env.NEXT_MOBILE_BUILD === 'true') return []
    return [
      {
        source: '/backend/:path*',
        destination: `${process.env.BACKEND_URL || 'https://qpark-production.up.railway.app'}/:path*`,
      },
    ]
  },
}

export default nextConfig
