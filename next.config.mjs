// Next.js の設定
// next.config.ts は Next.js 14 では未対応のため .mjs を使用する

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Supabase Storage の画像を最適化対象に追加
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
