// 記事詳細ページ（ISR: 24時間ごとに再生成）
// - OGP メタデータ付き
// - JSON-LD 構造化データ付き（Article スキーマ）
// - generateStaticParams でビルド時に既存記事を静的生成

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Article } from '@/types/index'

// ISR: 24時間（86400秒）ごとにページを再生成する
export const revalidate = 86400

// ----------------------------------------------------------------
// Supabase クライアント（公開読み取り専用・anon キー使用）
// generateStaticParams・generateMetadata・ページ本体で共用
// ----------------------------------------------------------------
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  )
}

// ----------------------------------------------------------------
// generateStaticParams
// ビルド時に全記事スラッグを取得して静的ページを事前生成する
// 新しい記事は on-demand ISR で初回アクセス時に生成 → キャッシュ
// 環境変数が未設定の場合（ローカルビルド等）は空配列を返す
// ----------------------------------------------------------------
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 環境変数が未設定ならビルドをスキップ（ISR で on-demand 生成に委ねる）
  if (!url || !key) return []

  const supabase = getSupabaseClient()
  const { data } = await supabase
    .from('articles')
    .select('slug')
    .order('published_at', { ascending: false })
    .limit(100) // 初期ビルドでは最新100件のみ事前生成

  return (data ?? []).map((row: { slug: string }) => ({ slug: row.slug }))
}

// ----------------------------------------------------------------
// generateMetadata: OGP タグを動的生成
// ----------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const supabase = getSupabaseClient()
  const { data } = await supabase
    .from('articles')
    .select('title, meta_description, published_at')
    .eq('slug', params.slug)
    .single()

  if (!data) {
    return { title: '記事が見つかりません' }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://example.com'
  const canonicalUrl = `${appUrl}/articles/${params.slug}`

  return {
    title: data.title,
    description: data.meta_description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: data.title,
      description: data.meta_description,
      url: canonicalUrl,
      type: 'article',
      publishedTime: data.published_at,
      siteName: 'pj5000',
    },
    twitter: {
      card: 'summary_large_image',
      title: data.title,
      description: data.meta_description,
    },
  }
}

// ----------------------------------------------------------------
// ページコンポーネント
// ----------------------------------------------------------------
export default async function ArticlePage({
  params,
}: {
  params: { slug: string }
}) {
  const supabase = getSupabaseClient()
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (!data) {
    notFound()
  }

  const article = data as Article
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://example.com'
  const canonicalUrl = `${appUrl}/articles/${article.slug}`

  // JSON-LD 構造化データ（Article スキーマ）
  // Google 検索でのリッチリザルト表示に対応
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta_description,
    datePublished: article.published_at,
    dateModified: article.updated_at,
    url: canonicalUrl,
    publisher: {
      '@type': 'Organization',
      name: 'pj5000',
      url: appUrl,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
  }

  const formattedDate = new Date(article.published_at).toLocaleDateString(
    'ja-JP',
    { year: 'numeric', month: 'long', day: 'numeric' },
  )

  return (
    <>
      {/* JSON-LD 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="mx-auto max-w-3xl px-4 py-12">
        <article>
          {/* 記事ヘッダー */}
          <header className="mb-8">
            <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              {article.title}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <time dateTime={article.published_at}>{formattedDate}</time>
            </div>
          </header>

          {/* 本文（Claude が生成した HTML を信頼ソースとして直接レンダリング）
              外部ユーザー入力ではなく自社パイプライン生成のため XSS リスクなし */}
          <div
            className="prose prose-slate max-w-none"
            dangerouslySetInnerHTML={{ __html: article.body }}
          />
        </article>
      </main>
    </>
  )
}
