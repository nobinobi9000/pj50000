// アプリケーション全体のルートレイアウト
// すべてのページに共通して適用される HTML 構造を定義する

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Header from '@/components/header'
import Footer from '@/components/footer'

// Inter フォントを最適化して読み込む
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://legal.nobi-labo.com'
const SITE_NAME = '法律書類ジェネレーター'
const SITE_DESCRIPTION =
  '契約書・内容証明・利用規約などの法律書類をAIが瞬時に生成。テンプレート不要、無料で3回まで利用できます。'

// SEO メタデータ
export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} | 契約書・内容証明を無料で自動作成`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    '契約書 自動作成',
    '内容証明 AI',
    '法律書類 ジェネレーター',
    '契約書 無料',
    '業務委託契約書',
    '利用規約 自動生成',
    'AI 契約書',
    '法律 テンプレート',
  ],
  metadataBase: new URL(APP_URL),
  alternates: {
    canonical: APP_URL,
  },
  openGraph: {
    title: `${SITE_NAME} | 契約書・内容証明を無料で自動作成`,
    description: SITE_DESCRIPTION,
    url: APP_URL,
    siteName: SITE_NAME,
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | 契約書・内容証明を無料で自動作成`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: '4f601pZD_45OSOWgaTq7T01T-jwQg7-bPoXDuUv9aBc',
  },
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
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  )
}
