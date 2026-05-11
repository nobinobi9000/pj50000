// アプリケーション全体のルートレイアウト
// すべてのページに共通して適用される HTML 構造を定義する

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

// Inter フォントを最適化して読み込む
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

// SEO メタデータ
export const metadata: Metadata = {
  title: {
    default: 'pj5000',
    template: '%s | pj5000',
  },
  description: 'pj5000 アプリケーション',
}

interface RootLayoutProps {
  children: React.ReactNode
}

/**
 * ルートレイアウトコンポーネント
 * HTML の骨格と共通スタイルを提供する
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
