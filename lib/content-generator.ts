// SEOコンテンツ自動生成パイプライン - トピック管理とプロンプト定義

// ----------------------------------------------------------------
// トピックのシードリスト
// 毎日1トピックを順番に消化する（dayOfYear % TOPIC_SEEDS.length）
// ----------------------------------------------------------------
export const TOPIC_SEEDS = [
  'Next.js App Router のパフォーマンス最適化完全ガイド',
  'TypeScript の型安全を極める実践テクニック10選',
  'Supabase Row Level Security で安全なマルチテナントアプリを作る方法',
  'Tailwind CSS v3 から v4 への移行ガイドと注意点',
  'React Server Components と Client Components の使い分け戦略',
  'Vercel Edge Functions vs Serverless Functions: 使い分けの判断基準',
  'shadcn/ui カスタマイズ完全ガイド: デザインシステムを構築する',
  'PostgreSQL インデックス設計: 遅いクエリを劇的に改善する方法',
  'Next.js ISR と SSG の違いと選択基準: 最新 App Router 対応版',
  'Claude API でコンテンツ生成パイプラインを構築する実践入門',
  'Supabase Auth でソーシャルログインを5分で実装する',
  'Web Core Vitals 改善の実践: LCP・INP・CLS を徹底攻略',
  'TypeScript 5.x 新機能まとめ: 実務で役立つ機能を厳選解説',
  'Next.js のキャッシュ戦略を理解する: fetch・Router・Full Route',
  'Zod でバリデーション設計: フロントとバックを一元管理する',
  'Prisma vs Drizzle ORM: Next.js プロジェクトでの選択基準',
  'React Hook Form と Zod で型安全なフォームを作る',
  'Supabase Storage で画像アップロードと最適化を実装する',
  'Next.js Middleware で認証・リダイレクト・A/Bテストを実装',
  'OpenGraph と JSON-LD で SEO スコアを最大化する設定方法',
] as const

export type TopicSeed = (typeof TOPIC_SEEDS)[number]

// ----------------------------------------------------------------
// トピック選択: 年の何日目かに基づいて決定論的に選択
// 同じ日に複数回実行しても同じトピックが選ばれる
// ----------------------------------------------------------------
export function pickTopic(): TopicSeed {
  const now = new Date()
  const startOfYear = new Date(now.getUTCFullYear(), 0, 1)
  const dayOfYear = Math.floor(
    (now.getTime() - startOfYear.getTime()) / 86_400_000,
  )
  return TOPIC_SEEDS[dayOfYear % TOPIC_SEEDS.length]
}

// ----------------------------------------------------------------
// スラッグ生成
// 日本語タイトルから ASCII スラッグを作れないため、
// トピックのインデックス + 日付でユニーク性を担保する
// ----------------------------------------------------------------
export function buildSlug(topicIndex: number, date: Date): string {
  const dateStr = date.toISOString().slice(0, 10) // "2025-05-10"
  return `article-${topicIndex}-${dateStr}`
}

export function getTopicIndex(topic: TopicSeed): number {
  return TOPIC_SEEDS.indexOf(topic)
}

// ----------------------------------------------------------------
// システムプロンプト（Anthropic Prompt Caching の対象）
// Claude API の呼び出しごとにキャッシュヒットさせることで
// トークンコストを約90%削減できる
// ----------------------------------------------------------------
export const SYSTEM_PROMPT = `あなたはSEOに精通した日本語ライターです。
与えられたトピックに関して、検索エンジンで上位表示を狙った高品質な日本語記事を生成してください。

## 出力形式
必ず以下のJSONのみを返してください。余分なテキスト・コードブロック記法は不要です。

{
  "title": "記事タイトル（40〜60文字、対象キーワードを含む）",
  "meta_description": "メタディスクリプション（120〜160文字、CTA含む）",
  "body": "HTML形式の本文（後述の構成に従うこと）"
}

## 本文の構成（HTML形式で出力）
- <h2>見出し</h2> を3〜5個使用
- 各セクションは <p> タグで段落を構成
- リストは <ul><li>...</li></ul> または <ol> を使用
- 強調は <strong> タグを使用
- コードがある場合は <pre><code>...</code></pre> を使用
- 全体の文字数: 1,500〜2,500文字

## SEO要件
- タイトルの冒頭にメインキーワードを配置
- h2 見出しにも関連キーワードを自然に含める
- E-E-A-T（経験・専門性・権威性・信頼性）を意識した文体
- 読者の疑問に答える構成（検索意図への対応）
- 内部リンクのアンカーテキストを想定した自然な言い回し`

// ----------------------------------------------------------------
// ユーザープロンプト: トピックを渡して記事生成をリクエスト
// ----------------------------------------------------------------
export function buildUserPrompt(topic: TopicSeed): string {
  return `以下のトピックについて記事を生成してください。

トピック: ${topic}

出力はJSONのみで、余分なテキストは含めないでください。`
}
