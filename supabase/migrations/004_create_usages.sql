-- ================================================================
-- 004_create_usages.sql
-- ツール利用履歴テーブル
-- 無料ユーザーの月間利用回数制限を管理する
-- ================================================================

-- ----------------------------------------------------------------
-- usages テーブル
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ログイン済みユーザーの場合は auth.users.id を参照
  -- 匿名ユーザーの場合は NULL
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ユニーク識別子: ログイン済み = user_id、匿名 = 'anon:{IP}'
  identifier  text        NOT NULL,
  -- 使用したツール名: 'contract-generator' など
  tool_name   text        NOT NULL,
  used_at     timestamptz NOT NULL DEFAULT now()
);

-- インデックス: 月間カウントクエリの高速化
CREATE INDEX IF NOT EXISTS idx_usages_identifier_tool_month
  ON usages (identifier, tool_name, date_trunc('month', used_at));

-- インデックス: user_id による検索（ユーザー削除時の CASCADE 用）
CREATE INDEX IF NOT EXISTS idx_usages_user_id
  ON usages (user_id)
  WHERE user_id IS NOT NULL;

-- ----------------------------------------------------------------
-- Row Level Security (RLS)
-- ----------------------------------------------------------------
ALTER TABLE usages ENABLE ROW LEVEL SECURITY;

-- 読み取り: 自分自身のレコードのみ
CREATE POLICY "usages_select_own"
  ON usages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 書き込み: サービスロール（管理者）のみ
-- generate-contract API が supabase-admin クライアント経由でのみ INSERT する
CREATE POLICY "usages_insert_service_role"
  ON usages FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "usages_update_service_role"
  ON usages FOR UPDATE
  TO service_role
  USING (true);

-- ----------------------------------------------------------------
-- monthly_usages ビュー: 月間利用回数の集計
-- ----------------------------------------------------------------
-- identifier と tool_name ごとに、月ごとの利用回数を集計する
-- 使用例:
--   SELECT usage_count FROM monthly_usages
--   WHERE identifier = 'user:xxx' AND tool_name = 'contract-generator'
--     AND month = date_trunc('month', now());
CREATE OR REPLACE VIEW monthly_usages AS
SELECT
  identifier,
  tool_name,
  date_trunc('month', used_at) AS month,
  count(*)::integer             AS usage_count
FROM usages
GROUP BY identifier, tool_name, date_trunc('month', used_at);

-- ----------------------------------------------------------------
-- updated_at 自動更新トリガー（usages は used_at で管理するため不要だが
-- 将来の拡張に備えてコメントのみ記載）
-- ----------------------------------------------------------------
-- usages テーブルはイミュータブルな記録なので UPDATE は行わない
