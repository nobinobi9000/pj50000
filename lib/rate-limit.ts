// Upstash Redis を使用したレートリミッター
// 全APIルートで共通利用する。未設定時はレート制限をスキップ（開発環境対応）

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// シンプルな結果型（呼び出し元は success のみチェックすれば良い）
export type RateLimitResult = { success: boolean }

// 成功時フォールバック（Upstash 未設定環境用）
const ALLOW: RateLimitResult = { success: true }

/**
 * Upstash Redis インスタンスを生成する
 * 環境変数が未設定の場合は null を返す
 */
function buildRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

/**
 * レートリミットチェックを実行する汎用関数
 * Redis が利用できない場合は常に通過させる（fail-open）
 */
async function check(
  identifier: string,
  preset: 'api' | 'webhook' | 'cron',
): Promise<RateLimitResult> {
  const redis = buildRedis()
  if (!redis) return ALLOW

  const configs: Record<typeof preset, { limiter: ReturnType<typeof Ratelimit.slidingWindow>; prefix: string }> = {
    // 通常 API: IP ごとに 1分10リクエスト（slidingWindow で均等分散）
    api: { limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:api' },
    // Stripe Webhook: IP ごとに 1分100リクエスト（Stripe は再送するため高めに設定）
    webhook: { limiter: Ratelimit.slidingWindow(100, '1 m'), prefix: 'rl:wh' },
    // Cron: 固定キーで 1時間に1回（冪等性の二重実行防止）
    cron: { limiter: Ratelimit.fixedWindow(1, '1 h'), prefix: 'rl:cron' },
  }

  const { limiter, prefix } = configs[preset]
  const ratelimit = new Ratelimit({ redis, limiter, prefix })
  const result = await ratelimit.limit(identifier)
  return { success: result.success }
}

// ----------------------------------------------------------------
// エクスポート: 各エンドポイント用レートリミット関数
// ----------------------------------------------------------------

/** 通常 API エンドポイント用（IP ベース） */
export const limitApi = (identifier: string) => check(identifier, 'api')

/** Stripe Webhook 用（IP ベース、高リミット） */
export const limitWebhook = (identifier: string) => check(identifier, 'webhook')

/** Cron Job 用（固定キー、1時間1回） */
export const limitCron = (identifier: string) => check(identifier, 'cron')

/**
 * リクエストから IP アドレスを取得するユーティリティ
 * Vercel の x-forwarded-for ヘッダーを優先する
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'anonymous'
  )
}
