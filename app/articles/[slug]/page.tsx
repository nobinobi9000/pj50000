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
    { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo' },
  )

  return (
    <>
      {/* JSON-LD 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* パンくずリスト */}
        <nav className="mb-6 text-sm text-muted-foreground">
          <a href="/" className="hover:text-foreground transition-colors">ホーム</a>
          <span className="mx-2">/</span>
          <a href="/articles" className="hover:text-foreground transition-colors">法律コラム</a>
          <span className="mx-2">/</span>
          <span className="text-foreground line-clamp-1">{article.title}</span>
        </nav>

        <article>
          {/* 記事ヘッダー */}
          <header className="mb-10 border-b pb-8">
            <h1 className="mb-5 text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              {article.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <time dateTime={article.published_at} className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                {formattedDate}
              </time>
              <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
                法律コラム
              </span>
            </div>
            {/* リード文 */}
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              {article.meta_description}
            </p>
          </header>

          {/* 本文（Claude が生成した HTML を信頼ソースとして直接レンダリング）
              外部ユーザー入力ではなく自社パイプライン生成のため XSS リスクなし */}
          <div
            className="
              prose prose-slate max-w-none
              prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground
              prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-l-4 prose-h2:border-primary prose-h2:pl-3
              prose-p:text-base prose-p:leading-8 prose-p:text-foreground/90
              prose-li:text-base prose-li:leading-7 prose-li:text-foreground/90
              prose-strong:text-foreground prose-strong:font-semibold
              prose-a:text-primary prose-a:underline prose-a:underline-offset-2
              prose-pre:bg-muted prose-pre:text-sm prose-pre:rounded-lg prose-pre:overflow-x-auto
              prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-code:font-mono
              prose-ul:my-4 prose-ol:my-4
              prose-blockquote:border-primary prose-blockquote:text-muted-foreground
            "
            dangerouslySetInnerHTML={{ __html: article.body }}
          />
        </article>

        {/* CTA セクション */}
        <div className="mt-16 rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-8 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">AI Legal Generator</p>
          <h2 className="mb-3 text-xl font-bold text-foreground sm:text-2xl">
            実際に契約書を作成してみませんか？
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            業務委託契約書・秘密保持契約など、AIが必要事項を入力するだけで自動生成します。<br />
            無料で3回まで利用できます。
          </p>
          <a
            href="/tools/contract-generator"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow transition-opacity hover:opacity-90"
          >
            無料で書類を作成する →
          </a>
        </div>

        {/* 記事一覧に戻る */}
        <div className="mt-8 text-center">
          <a href="/articles" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← 法律コラム一覧に戻る
          </a>
        </div>
      </div>
    </>
  )
}
