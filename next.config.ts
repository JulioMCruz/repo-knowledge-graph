import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: 'standalone',
  
  images: {
    unoptimized: true,
  },
  
  turbopack: {},
}

export default nextConfig
