// サイトマップ自動生成
// Next.js の MetadataRoute.Sitemap を使い、静的ページ + Supabase 記事を列挙する
// force-dynamic: ビルド時キャッシュを使わず毎回 Supabase から最新slugを取得する

import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://legal.nobi-labo.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 静的ページ
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: APP_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${APP_URL}/articles`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${APP_URL}/tools/contract-generator`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${APP_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${APP_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${APP_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  // Supabase から記事一覧を取得
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let articlePages: MetadataRoute.Sitemap = []

  if (url && key) {
    const supabase = createClient(url, key)
    const { data } = await supabase
      .from('articles')
      .select('slug, published_at, updated_at')
      .order('published_at', { ascending: false })

    articlePages = (data ?? []).map((article: { slug: string; updated_at: string }) => ({
      url: `${APP_URL}/articles/${article.slug}`,
      lastModified: new Date(article.updated_at),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))
  }

  return [...staticPages, ...articlePages]
}
