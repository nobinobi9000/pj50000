-- SEO記事を管理する articles テーブル
-- Vercel Cron から Claude API で生成した記事を保存する

CREATE TABLE IF NOT EXISTS articles (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text        NOT NULL UNIQUE,
  title            text        NOT NULL,
  body             text        NOT NULL,       -- HTML形式の本文
  meta_description text        NOT NULL,
  published_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- updated_at を UPDATE 時に自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 検索・ソート用インデックス
CREATE INDEX IF NOT EXISTS articles_slug_idx         ON articles (slug);
CREATE INDEX IF NOT EXISTS articles_published_at_idx ON articles (published_at DESC);

-- Row Level Security: 公開記事は匿名ユーザーも読み取り可能
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "articles_public_read" ON articles
  FOR SELECT USING (true);

-- 書き込みはサービスロールキーのみ許可（Cron Job 専用）
-- INSERT / UPDATE / DELETE は RLS ポリシーなし → サービスロールのみ実行可能
