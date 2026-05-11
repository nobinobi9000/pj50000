-- エラーログ管理テーブル
-- API ルートが try/catch でキャッチしたエラーを記録する
-- health-check Cron がここを監視して閾値超過時に GitHub Issue / Self-heal を起動する

CREATE TABLE IF NOT EXISTS error_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  route         text        NOT NULL,        -- エラーが発生したパス（例: /api/cron/generate-content）
  error_message text        NOT NULL,
  stack_trace   text,
  source_file   text,                        -- 修正対象ファイルパス（例: app/api/cron/generate-content/route.ts）
  severity      text        NOT NULL DEFAULT 'error',  -- 'warning' | 'error' | 'critical'
  count         integer     NOT NULL DEFAULT 1,        -- 同一エラーの累積発生回数
  resolved      boolean     NOT NULL DEFAULT false,
  heal_pr_url   text,                        -- Self-heal が作成した PR URL（成功時に記録）
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 検索・集計用インデックス
CREATE INDEX IF NOT EXISTS error_logs_route_idx      ON error_logs (route);
CREATE INDEX IF NOT EXISTS error_logs_severity_idx   ON error_logs (severity);
CREATE INDEX IF NOT EXISTS error_logs_resolved_idx   ON error_logs (resolved) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON error_logs (created_at DESC);

-- updated_at 自動更新
CREATE TRIGGER error_logs_updated_at
  BEFORE UPDATE ON error_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: 読み書きはサービスロール（管理者）のみ
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
-- ポリシー未定義 = サービスロールキーでのみアクセス可能
