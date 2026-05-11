// サービスロールキーを使用する管理者用 Supabase クライアント
// RLSをバイパスして書き込みが可能 - サーバーサイド（Cron Route）専用
// このクライアントをクライアントコンポーネントやブラウザに渡してはいけない

import { createClient } from '@supabase/supabase-js'

/**
 * サービスロールキーで初期化した管理者用クライアントを返す
 * Route Handler / Cron Job からのみ呼び出すこと
 *
 * 注: Supabase CLI による型生成（supabase gen types typescript）を行っていないため
 *     ジェネリックなしで初期化し、呼び出し側でキャスト・型注釈を行う
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません',
    )
  }

  return createClient(url, key, {
    auth: {
      // サーバーサイドのみで使用するためセッション永続化は不要
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
