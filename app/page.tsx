// トップページ
// ヒーロー + 最新記事3件 + 機能紹介カード

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { FileText, Calendar, Zap, Scale, Gift } from 'lucide-react'
import { HankoDeHankoBanner } from '@/components/ads/hanko-de-hanko-banner'
import type { Article } from '@/types/index'

// ISR: 24時間
export const revalidate = 86400

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  )
}

export default async function HomePage() {
  // 最新記事3件を取得
  let latestArticles: Article[] = []
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (url && key) {
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('articles')
      .select('id, slug, title, meta_description, published_at, updated_at, body')
      .order('published_at', { ascending: false })
      .limit(3)
    latestArticles = (data ?? []) as Article[]
  }

  return (
    <>
      {/* ヒーローセクション */}
      <section className="bg-gradient-to-b from-muted/50 to-background px-4 py-20 text-center sm:py-28">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">
            AI Legal Document Generator
          </p>
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            法律書類を、<br className="sm:hidden" />
            AIが瞬時に生成
          </h1>
          <p className="mb-10 text-lg leading-relaxed text-muted-foreground sm:text-xl">
            契約書・内容証明・利用規約など、面倒な法律書類をAIが自動作成。<br className="hidden sm:inline" />
            テンプレート不要。必要事項を入力するだけで、すぐに使えます。
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="px-8 text-base">
              <Link href="/tools/contract-generator">
                無料で書類を作成する
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="px-8 text-base">
              <Link href="/articles">
                法律コラムを読む
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 機能紹介セクション */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            選ばれる3つの理由
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {/* Feature 1 */}
            <div className="flex flex-col items-center rounded-lg border bg-card p-6 text-center shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">AIが瞬時に生成</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                必要事項を入力するだけで、数秒以内に完成した書類を生成。弁護士への相談前の下書きとしても最適です。
              </p>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col items-center rounded-lg border bg-card p-6 text-center shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Scale className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">法律的な観点で作成</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                日本の法令に準拠したテンプレートをもとに生成。秘密保持・損害賠償・解除条項など重要事項を網羅します。
              </p>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col items-center rounded-lg border bg-card p-6 text-center shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Gift className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">無料で3回まで</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                登録不要で今すぐ試せます。無料枠で3回まで書類を生成できます。まずはお気軽にお試しください。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 広告: はんこdeハンコ */}
      <section className="px-4 py-4">
        <HankoDeHankoBanner />
      </section>

      {/* 最新記事セクション */}
      <section className="bg-muted/30 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              法律コラム
            </h2>
            <Link
              href="/articles"
              className="text-sm font-medium text-primary hover:underline"
            >
              すべて見る →
            </Link>
          </div>

          {latestArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
              <FileText className="mb-3 h-8 w-8 opacity-40" />
              <p>記事を準備中です。しばらくお待ちください。</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-3">
              {latestArticles.map((article) => {
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
                    className="group flex flex-col rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <time dateTime={article.published_at}>{formattedDate}</time>
                    </div>
                    <h3 className="mb-2 text-base font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    <p className="mt-auto text-xs text-muted-foreground line-clamp-3">
                      {article.meta_description}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* 下部CTA */}
      <section className="px-4 py-16 text-center">
        <div className="mx-auto max-w-xl">
          <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">
            今すぐ無料で試してみる
          </h2>
          <p className="mb-8 text-muted-foreground">
            登録不要・無料3回。業務委託契約書から秘密保持契約まで、様々な書類に対応しています。
          </p>
          <Button asChild size="lg" className="px-10 text-base">
            <Link href="/tools/contract-generator">
              書類を作成する（無料）
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
