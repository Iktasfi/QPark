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
        destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/:path*`,
      },
    ]
  },
}

export default nextConfig
