// 記事一覧ページ
// Supabase から articles を published_at 降順で最大50件取得
// ISR（24時間）で静的生成

import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { FileText, Calendar } from 'lucide-react'
import type { Article } from '@/types/index'

// ISR: 24時間ごとに再生成
export const revalidate = 86400

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://legal.nobi-labo.com'
const SITE_NAME = '法律書類ジェネレーター'

// ----------------------------------------------------------------
// SEO メタデータ
// ----------------------------------------------------------------
export const metadata: Metadata = {
  title: '法律コラム一覧',
  description:
    '契約書・法律・ビジネスに関する実用的なコラムを掲載。AI生成の法律書類作成ツールと合わせてご活用ください。',
  alternates: {
    canonical: `${APP_URL}/articles`,
  },
  openGraph: {
    title: `法律コラム一覧 | ${SITE_NAME}`,
    description: '契約書・法律・ビジネスに関する実用的なコラムを掲載。',
    url: `${APP_URL}/articles`,
    siteName: SITE_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `法律コラム一覧 | ${SITE_NAME}`,
    description: '契約書・法律・ビジネスに関する実用的なコラムを掲載。',
  },
}

// ----------------------------------------------------------------
// Supabase クライアント（anon キー・読み取り専用）
// ----------------------------------------------------------------
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  )
}

// ----------------------------------------------------------------
// ページコンポーネント
// ----------------------------------------------------------------
export default async function ArticlesPage() {
  // 環境変数が未設定の場合は空配列で graceful degrade
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let articles: Article[] = []

  if (url && key) {
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('articles')
      .select('id, slug, title, meta_description, published_at, updated_at, body')
      .order('published_at', { ascending: false })
      .limit(50)

    articles = (data ?? []) as Article[]
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      {/* ページヘッダー */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          法律コラム一覧
        </h1>
        <p className="mt-3 text-muted-foreground">
          契約書・法律・ビジネスに関する実用的な情報をお届けします。
        </p>
      </div>

      {/* 記事がない場合 */}
      {articles.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center text-muted-foreground">
          <FileText className="mb-4 h-10 w-10 opacity-40" />
          <p className="text-lg font-medium">記事はまだありません</p>
          <p className="mt-1 text-sm">しばらくお待ちください。</p>
        </div>
      )}

      {/* 記事カード一覧 */}
      {articles.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2">
          {articles.map((article) => {
            const formattedDate = new Date(article.published_at).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Tokyo',
            })

            return (
              <Link
                key={article.slug}
                href={`/articles/${article.slug}`}
                className="group flex flex-col rounded-lg border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                {/* 公開日 */}
                <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <time dateTime={article.published_at}>{formattedDate}</time>
                </div>

                {/* タイトル */}
                <h2 className="mb-2 text-lg font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
                  {article.title}
                </h2>

                {/* 説明 */}
                <p className="mt-auto text-sm text-muted-foreground line-clamp-3">
                  {article.meta_description}
                </p>

                {/* 続きを読む */}
                <span className="mt-4 text-xs font-medium text-primary">
                  続きを読む →
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
