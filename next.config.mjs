/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: 'https://qpark-production.up.railway.app/:path*',
      },
    ]
  },
}

export default nextConfig
