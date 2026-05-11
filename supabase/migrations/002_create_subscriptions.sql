-- サブスクリプション管理テーブル
-- Stripe の payment_intent.succeeded Webhook で更新される

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id       text        UNIQUE,
  stripe_subscription_id   text        UNIQUE,
  stripe_payment_intent_id text,       -- 最後に成功した PaymentIntent ID（冪等チェック用）
  plan                     text        NOT NULL DEFAULT 'free',   -- 'free' | 'premium'
  status                   text        NOT NULL DEFAULT 'active', -- 'active' | 'canceled' | 'past_due'
  current_period_end       timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx          ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_idx  ON subscriptions (stripe_customer_id);

-- updated_at 自動更新（001 で定義した update_updated_at 関数を再利用）
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: 本人のみ自分のサブスクリプションを参照可能
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_own_read" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- 書き込みはサービスロールのみ（Stripe Webhook 専用）
