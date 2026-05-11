// Stripe Checkout Session 作成エンドポイント
// 認証済みユーザーがプレミアムプランに申し込む際に呼び出す
// Rate limiting: IP ベースで 1分10リクエスト

import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { limitApi, getClientIp } from '@/lib/rate-limit'

// Stripe クライアントはリクエスト時に初期化（ビルド時に env が未設定のため）
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY が設定されていません')
  return new Stripe(key)
}

export async function POST(request: Request): Promise<Response> {
  // ----------------------------------------------------------------
  // 1. Rate limiting
  // ----------------------------------------------------------------
  const ip = getClientIp(request)
  const { success } = await limitApi(ip)
  if (!success) {
    return Response.json({ error: 'Too Many Requests' }, { status: 429 })
  }

  // ----------------------------------------------------------------
  // 2. 認証チェック
  // ----------------------------------------------------------------
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ----------------------------------------------------------------
  // 3. すでにプレミアム加入済みかチェック（二重申込み防止）
  // ----------------------------------------------------------------
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingSub?.plan === 'premium' && existingSub?.status === 'active') {
    return Response.json({ error: 'すでにプレミアムプランです' }, { status: 400 })
  }

  // ----------------------------------------------------------------
  // 4. Stripe Checkout Session を作成
  // ----------------------------------------------------------------
  const stripe = getStripe()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://example.com'

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price: process.env.STRIPE_PREMIUM_PRICE_ID!,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    customer_email: user.email,
    // user_id をメタデータに埋め込む
    // payment_intent.succeeded Webhook でユーザー特定に使用
    metadata: { user_id: user.id },
    subscription_data: {
      metadata: { user_id: user.id },
    },
    // payment_intent_data は subscription モードでは使用不可のため
    // subscription_data.metadata 経由で user_id を伝播させる
    success_url: `${appUrl}/dashboard?upgrade=success`,
    cancel_url: `${appUrl}/upgrade?canceled=true`,
  })

  return Response.json({ url: session.url })
}
