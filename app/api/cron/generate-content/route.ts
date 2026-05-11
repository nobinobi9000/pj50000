// SEOコンテンツ自動生成 Cron Route
// Vercel Cron により毎日 03:00 JST（= 18:00 UTC 前日）に自動実行される
// Claude API で記事を生成し、Supabase の articles テーブルに保存する

import Anthropic from '@anthropic-ai/sdk'
import {
  SYSTEM_PROMPT,
  buildSlug,
  buildUserPrompt,
  getTopicIndex,
  pickTopic,
} from '@/lib/content-generator'
import { createAdminClient } from '@/lib/supabase-admin'
import { limitCron, getClientIp } from '@/lib/rate-limit'

// 使用するClaude モデル
// ユーザー指定: claude-sonnet-4-20250514
// 最新の利用可能なモデルに合わせて変更すること
const CLAUDE_MODEL = 'claude-sonnet-4-6'

// Claude API が返す JSON の形
type GeneratedArticle = {
  title: string
  meta_description: string
  body: string
}

/**
 * JSON 文字列内にある生の改行・タブ文字を \\n / \\t にエスケープする
 * Claude が body フィールドにコードブロックを含む場合、
 * JSON 仕様外の実改行文字が混入してパースに失敗することがあるため前処理する
 */
function sanitizeJsonString(json: string): string {
  let inString = false
  let prevEscape = false
  let result = ''

  for (let i = 0; i < json.length; i++) {
    const ch = json[i]

    if (prevEscape) {
      prevEscape = false
      result += ch
      continue
    }

    if (ch === '\\' && inString) {
      prevEscape = true
      result += ch
      continue
    }

    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }

    if (inString) {
      if (ch === '\n') { result += '\\n'; continue }
      if (ch === '\r') {
        // \r\n → \n（\r だけスキップして次の \n に任せる）
        if (json[i + 1] === '\n') continue
        result += '\\n'
        continue
      }
      if (ch === '\t') { result += '\\t'; continue }
    }

    result += ch
  }

  return result
}

// JSON 文字列をパースして型を検証する
function parseArticleJson(raw: string): GeneratedArticle {
  // コードブロック記法（```json ... ```）が含まれる場合は除去
  const step1 = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  // JSON 文字列内の生改行をエスケープ
  const cleaned = sanitizeJsonString(step1)
  const parsed: unknown = JSON.parse(cleaned)

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['title'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['meta_description'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['body'] !== 'string'
  ) {
    throw new Error('Claude のレスポンスが期待する JSON 形式ではありません')
  }

  return parsed as GeneratedArticle
}

export async function GET(request: Request): Promise<Response> {
  // ----------------------------------------------------------------
  // 1. Vercel Cron からのリクエストを認証する
  //    CRON_SECRET 環境変数と Authorization ヘッダーを照合
  // ----------------------------------------------------------------
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ----------------------------------------------------------------
  // 1-b. Rate limiting（Cron: 1時間に1回）
  // ----------------------------------------------------------------
  const ip = getClientIp(request)
  const { success: rateLimitOk } = await limitCron(`generate-content:${ip}`)
  if (!rateLimitOk) {
    return Response.json({ message: '実行済み: レート制限により今回はスキップ' })
  }

  // ----------------------------------------------------------------
  // 2. 今日のトピックを決定する
  // ----------------------------------------------------------------
  const topic = pickTopic()
  const topicIndex = getTopicIndex(topic)
  const now = new Date()
  const slug = buildSlug(topicIndex, now)

  // ----------------------------------------------------------------
  // 3. スラッグの重複チェック（同日に2回実行されても冪等に動作させる）
  // ----------------------------------------------------------------
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    return Response.json({
      ok: true,
      message: '本日分の記事はすでに生成済みです',
      slug,
    })
  }

  // ----------------------------------------------------------------
  // 4. Claude API で記事を生成する
  //    システムプロンプトに cache_control を設定してコストを削減
  // ----------------------------------------------------------------
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        // プロンプトキャッシュを有効化: 同じシステムプロンプトの再利用で
        // 入力トークンコストを最大 90% 削減できる
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(topic),
      },
    ],
  })

  // ----------------------------------------------------------------
  // 5. レスポンスをパース
  // ----------------------------------------------------------------
  const firstContent = message.content[0]
  if (firstContent?.type !== 'text') {
    return Response.json(
      { error: 'Claude API から予期しないレスポンス形式が返されました' },
      { status: 500 },
    )
  }

  let article: GeneratedArticle
  try {
    article = parseArticleJson(firstContent.text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { error: `JSONパース失敗: ${message}`, raw: firstContent.text },
      { status: 500 },
    )
  }

  // ----------------------------------------------------------------
  // 6. Supabase の articles テーブルに保存
  // ----------------------------------------------------------------
  const { error: insertError } = await supabase.from('articles').insert({
    slug,
    title: article.title,
    body: article.body,
    meta_description: article.meta_description,
    published_at: now.toISOString(),
  })

  if (insertError) {
    return Response.json(
      { error: `Supabase 保存エラー: ${insertError.message}` },
      { status: 500 },
    )
  }

  return Response.json({
    ok: true,
    slug,
    title: article.title,
    usage: message.usage,
  })
}
