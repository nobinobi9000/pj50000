// トップページ（ツール説明 + CTA）
// サーバーコンポーネントとして動作する

import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * トップページコンポーネント
 * ツールの説明と行動喚起（CTA）ボタンを表示する
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mx-auto max-w-3xl text-center">

        {/* ヒーローセクション */}
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          pj5000 へようこそ
        </h1>

        <p className="mb-8 text-lg text-muted-foreground sm:text-xl">
          このツールは〇〇を実現するためのアプリケーションです。
          シンプルで直感的なインターフェースで、素早く作業を進めることができます。
        </p>

        {/* CTA セクション */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href="/dashboard">
              はじめる
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/about">
              詳しく見る
            </Link>
          </Button>
        </div>

      </div>
    </main>
  )
}
