// Next.js Middleware: Supabase Auth によるルートガード
// - 認証が必要なパスへの未ログインアクセスをリダイレクト
// - プレミアム機能パスへの無料プランアクセスをリダイレクト
// - Supabase セッション Cookie をリフレッシュして常に最新状態を維持

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ----------------------------------------------------------------
// パス分類
// ----------------------------------------------------------------

// ログイン必須（無料プランも含む全ユーザー）
const AUTH_REQUIRED_PREFIXES = ['/dashboard', '/account', '/api/stripe/checkout']

// さらにプレミアムプランが必要なパス
const PREMIUM_REQUIRED_PREFIXES = ['/dashboard/premium', '/api/premium']

// ----------------------------------------------------------------
// Middleware 本体
// ----------------------------------------------------------------

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Next.js App Router 向け: レスポンスを先に生成しておく
  // Supabase クライアントがセッション Cookie を更新できるよう
  // request と response の両方を渡す必要がある
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // リクエストとレスポンス両方に Cookie をセット
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // セッションを検証・更新（期限切れトークンを自動リフレッシュ）
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ----------------------------------------------------------------
  // 1. 認証チェック: ログインが必要なパスへの未ログインアクセス
  // ----------------------------------------------------------------
  const requiresAuth = AUTH_REQUIRED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  )

  if (requiresAuth && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ----------------------------------------------------------------
  // 2. プレミアムチェック: 有料機能パスへのアクセス
  //    認証済みユーザーのみここに到達する（上のチェックで保証）
  // ----------------------------------------------------------------
  const requiresPremium = PREMIUM_REQUIRED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  )

  if (requiresPremium && user) {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .maybeSingle()

    // プレミアムプランかつアクティブでない場合はアップグレードページへ
    const isPremiumActive =
      subscription?.plan === 'premium' && subscription?.status === 'active'

    if (!isPremiumActive) {
      return NextResponse.redirect(new URL('/upgrade', request.url))
    }
  }

  return response
}

// ----------------------------------------------------------------
// Middleware を適用するパスの設定
// ----------------------------------------------------------------
export const config = {
  matcher: [
    // 静的ファイル・_next・favicon を除く全パスに適用
    // Stripe Webhook は除外（raw body が必要で Middleware と競合しない）
    '/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)',
  ],
}
