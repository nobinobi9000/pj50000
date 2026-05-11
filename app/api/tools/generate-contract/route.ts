// 契約書生成 API エンドポイント
// Claude API を使用して日本語の法律書類 HTML を生成する
//
// 利用制限:
//   - 匿名ユーザー  : 月 1 回（IP アドレスで管理）
//   - 無料ユーザー  : 月 3 回（user_id で管理）
//   - プレミアムユーザー: 無制限
//
// エラーは error_logs テーブルに記録する

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { limitApi, getClientIp } from '@/lib/rate-limit'
import type { ContractType } from '@/types'

// ----------------------------------------------------------------
// 定数
// ----------------------------------------------------------------

const CLAUDE_MODEL = 'claude-sonnet-4-6'

// 月間利用上限
const FREE_MONTHLY_LIMIT = 3
const ANON_MONTHLY_LIMIT = 1

// ----------------------------------------------------------------
// Zod スキーマ: リクエストボディの型検証
// ----------------------------------------------------------------

const requestSchema = z.object({
  // Zod v4: z.enum() の第2引数は { message } または文字列のみ
  contractType: z.enum(['service', 'nda', 'sales'], {
    message: '契約書の種類を選択してください',
  }),
  partyA: z
    .string()
    .min(1, '甲の名称を入力してください')
    .max(100, '甲の名称は100文字以内で入力してください'),
  partyB: z
    .string()
    .min(1, '乙の名称を入力してください')
    .max(100, '乙の名称は100文字以内で入力してください'),
  period: z.string().max(100, '契約期間は100文字以内で入力してください').optional(),
  amount: z.string().max(100, '報酬・金額は100文字以内で入力してください').optional(),
  description: z
    .string()
    .min(10, '主要条件を10文字以上入力してください')
    .max(2000, '主要条件は2000文字以内で入力してください'),
})

type RequestBody = z.infer<typeof requestSchema>

// ----------------------------------------------------------------
// Claude API 初期化（遅延: ビルド時クラッシュ防止）
// ----------------------------------------------------------------

function getAnthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY が設定されていません')
  return new Anthropic({ apiKey: key })
}

// ----------------------------------------------------------------
// Claude 用プロンプト構築
// ----------------------------------------------------------------

const CONTRACT_TYPE_NAMES: Record<ContractType, string> = {
  service: '業務委託契約書',
  nda: '秘密保持契約書（NDA）',
  sales: '売買契約書',
}

// 甲の役割名
const PARTY_A_ROLES: Record<ContractType, string> = {
  service: '委託者',
  nda: '開示者',
  sales: '売主',
}

// 乙の役割名
const PARTY_B_ROLES: Record<ContractType, string> = {
  service: '受託者',
  nda: '受領者',
  sales: '買主',
}

// システムプロンプト（プロンプトキャッシュで再利用）
const CONTRACT_SYSTEM_PROMPT = `あなたは日本の契約法に精通した法律専門家です。
入力された情報をもとに、日本語の正式な契約書を HTML 形式で生成してください。

## 出力フォーマット
- <article> タグで全体を囲む
- <h1> に契約書名（例:「業務委託契約書」）を記載
- 各条項は <section> タグで囲み、<h2> に「第X条（条項名）」形式で記載
- 条項の本文は <p> タグで記載
- 条項の中で細目がある場合は <ol> / <li> を使用
- 末尾に契約締結の確認文と、甲・乙それぞれの署名欄を <table> で記載
- class 属性は付けず、HTML 構造のみを返す

## 記載すべき条項の目安
- 業務委託: 業務内容・期間・報酬・権利帰属・秘密保持・契約解除・準拠法・管轄
- 秘密保持（NDA）: 定義・開示目的・秘密保持義務・例外事項・返還・損害賠償・期間・準拠法
- 売買: 売買物件・代金・引渡し・危険負担・瑕疵担保・所有権移転・準拠法・管轄

## 重要なルール
- 曖昧な部分は一般的な日本の商慣習・民法に基づいて補完する
- HTML タグのみを返し、\`\`\`html のようなコードブロック記法は使用しない
- <article> で始まり </article> で終わること
- DOCTYPE・<html>・<head>・<body> タグは含めない`

/**
 * ユーザープロンプトを組み立てる
 */
function buildUserPrompt(body: RequestBody): string {
  const typeName = CONTRACT_TYPE_NAMES[body.contractType]
  const roleA = PARTY_A_ROLES[body.contractType]
  const roleB = PARTY_B_ROLES[body.contractType]

  const lines = [
    `以下の情報をもとに${typeName}を生成してください。`,
    '',
    `【甲（${roleA}）】${body.partyA}`,
    `【乙（${roleB}）】${body.partyB}`,
  ]

  if (body.period) lines.push(`【契約期間】${body.period}`)
  if (body.amount) lines.push(`【報酬・金額】${body.amount}`)

  lines.push('', `【主要条件・業務内容・備考】`, body.description)

  return lines.join('\n')
}

// ----------------------------------------------------------------
// 利用回数チェック・記録ヘルパー
// ----------------------------------------------------------------

/**
 * 当月の利用回数を取得する（monthly_usages ビューを利用）
 */
async function getMonthlyUsageCount(
  identifier: string,
  toolName: string,
): Promise<number> {
  const supabase = createAdminClient()

  // monthly_usages ビューは identifier + tool_name + month で集計済み
  const { data, error } = await supabase
    .from('monthly_usages')
    .select('usage_count')
    .eq('identifier', identifier)
    .eq('tool_name', toolName)
    // 当月の月初め（UTC）と一致する行を取得
    .eq('month', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
    .maybeSingle()

  if (error) {
    // ビュー参照エラーは通過させてフォールバック（fail-open）
    console.warn('[generate-contract] monthly_usages 参照エラー:', error.message)
    return 0
  }

  return (data as { usage_count: number } | null)?.usage_count ?? 0
}

/**
 * 利用記録を usages テーブルに INSERT する
 */
async function recordUsage(
  identifier: string,
  toolName: string,
  userId: string | null,
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase.from('usages').insert({
    user_id: userId,
    identifier,
    tool_name: toolName,
  })

  if (error) {
    // 記録失敗はロギングのみ（生成結果は返す）
    console.error('[generate-contract] usages INSERT 失敗:', error.message)
  }
}

// ----------------------------------------------------------------
// エラーロギングヘルパー
// ----------------------------------------------------------------

async function logError(errorMessage: string, stackTrace?: string): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('error_logs').insert({
      route: '/api/tools/generate-contract',
      error_message: errorMessage,
      stack_trace: stackTrace ?? null,
      source_file: 'app/api/tools/generate-contract/route.ts',
      severity: 'error',
    })
  } catch {
    // ログ記録の失敗は無視
  }
}

// ----------------------------------------------------------------
// POST ハンドラー本体
// ----------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // ----------------------------------------------------------------
  // 1. IP レートリミット（Upstash Redis）
  // ----------------------------------------------------------------
  const ip = getClientIp(request)
  const { success: rateLimitOk } = await limitApi(ip)
  if (!rateLimitOk) {
    return Response.json({ error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' }, { status: 429 })
  }

  // ----------------------------------------------------------------
  // 2. Supabase Auth でユーザー確認（未ログインでも通過）
  // ----------------------------------------------------------------
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ----------------------------------------------------------------
  // 3. リクエストボディのバリデーション
  // ----------------------------------------------------------------
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'リクエストボディの JSON パースに失敗しました' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(rawBody)
  if (!parsed.success) {
    // Zod v4: ZodError のイシューは .issues プロパティ（v3 の .errors から変更）
    const firstIssue = parsed.error.issues[0]
    return Response.json(
      { error: firstIssue?.message ?? 'リクエストのバリデーションに失敗しました' },
      { status: 422 },
    )
  }
  const body = parsed.data

  // ----------------------------------------------------------------
  // 4. プラン判定・月間利用回数チェック
  //    identifier: ログイン済み = user_id, 匿名 = 'anon:{IP}'
  // ----------------------------------------------------------------
  const TOOL_NAME = 'contract-generator'
  const identifier = user ? user.id : `anon:${ip}`

  // プレミアムユーザー判定（subscriptions テーブルを参照）
  let isPremium = false
  if (user) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .maybeSingle()

    isPremium = sub?.plan === 'premium' && sub?.status === 'active'
  }

  // 月間利用回数チェック（プレミアムはスキップ）
  let remainingUses: number | null = null

  if (!isPremium) {
    const limit = user ? FREE_MONTHLY_LIMIT : ANON_MONTHLY_LIMIT
    const used = await getMonthlyUsageCount(identifier, TOOL_NAME)
    remainingUses = Math.max(0, limit - used)

    if (used >= limit) {
      const limitMsg = user
        ? `無料プランの月間利用上限（${FREE_MONTHLY_LIMIT}回）に達しました。プレミアムプランにアップグレードすると無制限でご利用いただけます。`
        : `ゲストの月間利用上限（${ANON_MONTHLY_LIMIT}回）に達しました。無料会員登録するとさらに${FREE_MONTHLY_LIMIT}回ご利用いただけます。`

      return Response.json({ error: limitMsg }, { status: 429 })
    }
  }

  // ----------------------------------------------------------------
  // 5. Claude API で契約書 HTML を生成
  // ----------------------------------------------------------------
  let html: string
  try {
    const anthropic = getAnthropic()

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: CONTRACT_SYSTEM_PROMPT,
          // プロンプトキャッシュ: 同一システムプロンプトの再利用でコスト削減
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(body),
        },
      ],
    })

    const firstContent = message.content[0]
    if (firstContent?.type !== 'text') {
      throw new Error('Claude API から予期しないレスポンス形式が返されました')
    }

    html = firstContent.text.trim()

    // <article> タグが含まれているか簡易検証
    if (!html.includes('<article') || !html.includes('</article>')) {
      throw new Error('Claude API のレスポンスが期待する HTML 形式ではありません')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined

    console.error('[generate-contract] Claude API エラー:', message)
    await logError(message, stack)

    return Response.json(
      { error: `契約書の生成に失敗しました: ${message}` },
      { status: 500 },
    )
  }

  // ----------------------------------------------------------------
  // 6. 利用回数を記録
  // ----------------------------------------------------------------
  await recordUsage(identifier, TOOL_NAME, user?.id ?? null)

  // remainingUses を生成後の残数に更新
  if (remainingUses !== null) {
    remainingUses = Math.max(0, remainingUses - 1)
  }

  // ----------------------------------------------------------------
  // 7. 生成した HTML を返す
  // ----------------------------------------------------------------
  return Response.json({
    html,
    remainingUses, // null = プレミアム（無制限）
  })
}
