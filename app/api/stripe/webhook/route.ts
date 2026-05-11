// Stripe Webhook ハンドラー
// payment_intent.succeeded イベントを処理して subscriptions テーブルを更新する
//
// ⚠️ このルートは middleware.ts の matcher から除外されている
//    Stripe 署名検証のために raw body（text）が必要なため

import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase-admin'
import { limitWebhook, getClientIp } from '@/lib/rate-limit'

// Stripe クライアントはリクエスト時に初期化（ビルド時に env が未設定のため）
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY が設定されていません')
  return new Stripe(key)
}

// ----------------------------------------------------------------
// subscriptions テーブルの Upsert ヘルパー
// ----------------------------------------------------------------

async function upsertSubscription(params: {
  userId: string
  stripeCustomerId: string
  stripeSubscriptionId: string | null
  stripePaymentIntentId: string
  currentPeriodEnd: Date | null
}): Promise<void> {
  const supabase = createAdminClient()

  // user_id で既存レコードを検索し、なければ INSERT / あれば UPDATE
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: params.userId,
      stripe_customer_id: params.stripeCustomerId,
      stripe_subscription_id: params.stripeSubscriptionId,
      stripe_payment_intent_id: params.stripePaymentIntentId,
      plan: 'premium',
      status: 'active',
      current_period_end: params.currentPeriodEnd?.toISOString() ?? null,
    },
    { onConflict: 'user_id' }, // user_id が重複する場合は UPDATE
  )

  if (error) {
    throw new Error(`subscriptions upsert 失敗: ${error.message}`)
  }
}

// ----------------------------------------------------------------
// payment_intent.succeeded ハンドラー
// ----------------------------------------------------------------

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  stripe: Stripe,
): Promise<void> {
  // ① メタデータから直接 user_id を取得（初回支払い）
  // Stripe.Metadata は Record<string,string> のため型推論が string になる
  // → null を代入できるよう明示的に string | null を宣言
  let userId: string | null = paymentIntent.metadata?.user_id ?? null

  const customerId =
    typeof paymentIntent.customer === 'string'
      ? paymentIntent.customer
      : (paymentIntent.customer?.id ?? null)

  // ② メタデータにない場合（更新時）、stripe_customer_id から Supabase を検索
  if (!userId && customerId) {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    userId = (data as { user_id: string } | null)?.user_id ?? null
  }

  if (!userId) {
    console.warn(
      '[webhook] payment_intent.succeeded: user_id を特定できませんでした',
      paymentIntent.id,
    )
    return
  }

  // サブスクリプション情報を Customer ID 経由で取得
  // Stripe v22 以降、PaymentIntent の invoice フィールドは直接参照できないため
  // Customer に紐づく有効なサブスクリプションを一覧から取得する
  let subscriptionId: string | null = null
  let currentPeriodEnd: Date | null = null

  if (customerId) {
    const { data: stripeSubscriptions } = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    })

    const latestSub = stripeSubscriptions[0]
    if (latestSub) {
      subscriptionId = latestSub.id
      // Stripe API 2026+ では current_period_end は SubscriptionItem に移動
      // Item が存在する場合のみ billing_cycle_anchor をフォールバックとして使用
      const anchorTs = latestSub.billing_cycle_anchor
      currentPeriodEnd = anchorTs ? new Date(anchorTs * 1000) : null
    }
  }

  await upsertSubscription({
    userId,
    stripeCustomerId: customerId ?? '',
    stripeSubscriptionId: subscriptionId,
    stripePaymentIntentId: paymentIntent.id,
    currentPeriodEnd,
  })

  console.log('[webhook] サブスクリプション更新完了:', userId)
}

// ----------------------------------------------------------------
// Webhook エンドポイント本体
// ----------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // ----------------------------------------------------------------
  // 1. Rate limiting（Stripe のリトライを考慮して高めに設定）
  // ----------------------------------------------------------------
  const ip = getClientIp(request)
  const { success } = await limitWebhook(ip)
  if (!success) {
    return Response.json({ error: 'Too Many Requests' }, { status: 429 })
  }

  // ----------------------------------------------------------------
  // 2. Stripe 署名検証
  //    raw body (text) が必要 → response.json() は使わない
  // ----------------------------------------------------------------
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return Response.json(
      { error: 'Stripe 署名ヘッダーまたは Webhook シークレットが未設定です' },
      { status: 400 },
    )
  }

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[webhook] 署名検証失敗:', message)
    return Response.json({ error: `Webhook 署名エラー: ${message}` }, { status: 400 })
  }

  // ----------------------------------------------------------------
  // 3. イベント処理
  // ----------------------------------------------------------------
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, stripe)
        break

      default:
        // 処理しないイベントは無視（200 を返して Stripe の再送を防ぐ）
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[webhook] イベント処理エラー:', event.type, message)
    // 500 を返すと Stripe が再送するため、処理可能なエラーは 200 で返す
    return Response.json({ error: message }, { status: 500 })
  }

  return Response.json({ received: true })
}
