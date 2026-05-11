// サーバーコンポーネント・Route Handler 用 Supabase クライアント設定
// Next.js の cookies() API を使って認証状態を Cookie から読み取る

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server Component または Route Handler の中でのみ呼び出せる
 * Supabase クライアントを返す
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component から呼び出した場合は Cookie 書き込みが制限される
            // Middleware で認証を更新しているため無視して問題ない
          }
        },
      },
    }
  )
}
