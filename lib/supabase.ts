// ブラウザ（クライアントコンポーネント）用 Supabase クライアント設定
// サーバーサイドで使う場合は lib/supabase-server.ts を使うこと

import { createBrowserClient } from '@supabase/ssr'

// 必須の環境変数を string 型として取得する（未設定時は起動時エラー）
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。.env.local を確認してください。`)
  }
  return value
}

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

/**
 * クライアントコンポーネントで使用する Supabase クライアントを返す
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
