// アプリケーション全体で使用する共通型定義

/**
 * subscriptions テーブルの行型
 */
export type Subscription = {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_payment_intent_id: string | null
  plan: 'free' | 'premium'
  status: 'active' | 'canceled' | 'past_due'
  current_period_end: string | null
  created_at: string
  updated_at: string
}

/**
 * error_logs テーブルの行型
 */
export type ErrorLog = {
  id: string
  route: string
  error_message: string
  stack_trace: string | null
  source_file: string | null
  severity: 'warning' | 'error' | 'critical'
  count: number
  resolved: boolean
  heal_pr_url: string | null
  created_at: string
  updated_at: string
}

/**
 * articles テーブルの行型
 * Supabase の articles テーブルと 1:1 で対応する
 */
export type Article = {
  id: string
  slug: string
  title: string
  body: string              // Claude が生成した HTML 形式の本文
  meta_description: string
  published_at: string      // ISO 8601 形式
  updated_at: string        // ISO 8601 形式
}

/**
 * API レスポンスの共通型
 * すべての API エンドポイントはこの形式でデータを返す
 */
export type ApiResponse<T> = {
  data: T | null
  error: string | null
}

/**
 * ページネーション情報の型
 */
export type PaginationMeta = {
  page: number
  perPage: number
  total: number
  totalPages: number
}

/**
 * Supabase の profiles テーブルに対応するユーザー型
 * 実際のテーブル定義に合わせて拡張すること
 */
export type UserProfile = {
  id: string
  email: string
  createdAt: string
  updatedAt: string
}

/**
 * usages テーブルの行型
 * ツール利用履歴・無料プランの月間制限管理に使用
 */
export type Usage = {
  id: string
  user_id: string | null      // 匿名ユーザーは null
  identifier: string          // ログイン済み = user_id, 匿名 = 'anon:{IP}'
  tool_name: string           // 例: 'contract-generator'
  used_at: string             // ISO 8601 形式
}

/**
 * monthly_usages ビューの行型
 */
export type MonthlyUsage = {
  identifier: string
  tool_name: string
  month: string               // ISO 8601 形式（月の先頭日付）
  usage_count: number
}

/**
 * 契約書生成 API のリクエスト型
 */
export type ContractType = 'service' | 'nda' | 'sales'

export type GenerateContractRequest = {
  contractType: ContractType
  partyA: string              // 甲（依頼者 / 開示者 / 売主）
  partyB: string              // 乙（受託者 / 受領者 / 買主）
  period?: string             // 契約期間
  amount?: string             // 報酬・金額
  description: string         // 主要条件・業務内容・備考
}

/**
 * 契約書生成 API のレスポンス型
 */
export type GenerateContractResponse = {
  html: string                // Claude が生成した契約書 HTML
  remainingUses: number | null  // null = unlimited（プレミアム）
}
