# pj5000 開発ログ

Claude Code との 6 セッションで構築・デプロイした内容の全記録。

---

## 目次

1. [セッション 1: プロジェクト基盤構築](#セッション-1-プロジェクト基盤構築)
2. [セッション 2: SEO コンテンツ自動生成パイプライン](#セッション-2-seo-コンテンツ自動生成パイプライン)
3. [セッション 3: Stripe 連携・エラー監視・Self-healing・通知・Middleware・Rate Limiting](#セッション-3-stripe-連携エラー監視self-healingミドルウェアレート制限)
4. [セッション 4: 法律書類ジェネレーター](#セッション-4-法律書類ジェネレーター)
5. [セッション 5: Vercel 本番デプロイ](#セッション-5-vercel-本番デプロイ)
6. [セッション 6: AdSense 審査対応・記事生成改善・UI 改善](#セッション-6-adsense-審査対応記事生成改善ui-改善)
7. [最終ファイル構成](#最終ファイル構成)
8. [環境変数一覧](#環境変数一覧)
9. [Vercel デプロイ手順](#vercel-デプロイ手順)
10. [累積ビルド検証結果](#累積ビルド検証結果)
11. [累積バグ・解決策一覧](#累積バグ解決策一覧)

---

## セッション 1: プロジェクト基盤構築

### 目的

空のディレクトリ `C:\Users\tkouno\pj5000` に Next.js 14 プロジェクトをゼロから構築する。

### 技術スタック

| カテゴリ | 採用技術 |
|---|---|
| フレームワーク | Next.js 14.2.35 (App Router) + TypeScript strict |
| スタイリング | Tailwind CSS v3.4 + shadcn/ui |
| バックエンド | Supabase (Auth / PostgreSQL / Storage) |
| デプロイ | Vercel |

### インストールパッケージ

```bash
npx create-next-app@14.2.35 . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
npm install @supabase/supabase-js@^2.105.4 @supabase/ssr@^0.10.3
npm install class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^3.5.0 tailwindcss-animate@^1.0.7 lucide-react
npx shadcn@latest add button
```

> **注意**: `create-next-app` は `.claude/` ディレクトリが存在すると拒否する。全ファイルを手動作成に切り替え。

### 作成ファイル一覧

| ファイル | 役割 |
|---|---|
| `app/layout.tsx` | ルートレイアウト（lang="ja"、Inter フォント） |
| `app/page.tsx` | トップページ（ヒーロー + CTA） |
| `app/globals.css` | CSS 変数定義（ライト/ダーク） |
| `components/ui/button.tsx` | shadcn/ui Button |
| `lib/supabase.ts` | ブラウザ用クライアント |
| `lib/supabase-server.ts` | Server Component / Route Handler 用クライアント |
| `lib/utils.ts` | `cn()` ユーティリティ |
| `types/index.ts` | 共通型定義 |
| `tailwind.config.ts` | shadcn/ui CSS 変数カラーシステム |
| `components.json` | shadcn/ui 設定 |
| `.env.local.example` | 環境変数テンプレート |

### 主な設計決定

| 項目 | 採用 | 理由 |
|---|---|---|
| `next.config.mjs` | `.mjs`（`.ts` でない） | Next.js 14 は `.ts` 形式の設定ファイル非対応（v15 以降で対応） |
| Tailwind v3 固定 | v3.4.x | shadcn/ui が v3 前提の CSS 変数システムを使用するため v4 不使用 |
| TypeScript 5.8.x | 5.x | Next.js 14 は TS 5.x でテスト済み。6.x はアルファ版 |
| Supabase クライアント分割 | 3 種類 | App Router では Cookie アクセスに応じてクライアントを分ける必要がある |
| `requireEnv()` ヘルパー | ビルド時エラー化 | 環境変数未設定を `undefined` ではなく例外として検出する |

### Supabase クライアント分割

```
lib/supabase.ts        → createBrowserClient（クライアントコンポーネント専用）
lib/supabase-server.ts → createServerClient + cookies()（Server Component / Route Handler）
lib/supabase-admin.ts  → createClient + SUPABASE_SERVICE_ROLE_KEY（Cron / 管理操作、RLS バイパス）
```

---

## セッション 2: SEO コンテンツ自動生成パイプライン

### 目的

Claude API を使い、毎日 SEO 記事を自動生成して Supabase に保存。ISR で静的配信する。

### 追加パッケージ

```bash
npm install @anthropic-ai/sdk
```

### 作成ファイル一覧

| ファイル | 役割 |
|---|---|
| `supabase/migrations/001_create_articles.sql` | articles テーブル定義 |
| `lib/content-generator.ts` | トピックリスト・プロンプト定義 |
| `lib/supabase-admin.ts` | サービスロールクライアント（新規作成） |
| `app/api/cron/generate-content/route.ts` | 記事生成 Cron エンドポイント |
| `app/articles/[slug]/page.tsx` | ISR 記事詳細ページ（OGP + JSON-LD） |
| `vercel.json` | Cron スケジュール設定 |
| `.env.local.example` | 環境変数テンプレート（更新） |

### DB マイグレーション: `articles` テーブル

```sql
CREATE TABLE articles (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text        NOT NULL UNIQUE,
  title            text        NOT NULL,
  body             text        NOT NULL,
  meta_description text        NOT NULL,
  published_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- RLS: 全員読み取り可（匿名ユーザー含む）
-- 書き込み: サービスロールのみ
```

### `lib/content-generator.ts` の設計

- **トピックシードリスト**: 20 件の日本語 SEO トピックを `as const` で定義
- **決定論的トピック選択**: `dayOfYear % topics.length` → 毎日同じトピック（冪等性）
- **スラッグ生成**: `article-{topicIndex}-{YYYY-MM-DD}` で日本語タイトルの ASCII 変換問題を回避

### Cron エンドポイントの処理フロー

```
GET /api/cron/generate-content
  ↓
1. Authorization: Bearer {CRON_SECRET} ヘッダー認証
2. IP レートリミット（limitCron: 1 req/h）
3. トピック選択 → スラッグ生成
4. 重複チェック（同日 2 回実行でも冪等）
5. Claude API 呼び出し（claude-sonnet-4-6）
   └─ system prompt に cache_control: ephemeral → 入力トークンコスト最大 90% 削減
6. JSON レスポンスをパース（```json コードブロック記法の除去）
7. Supabase articles テーブルに INSERT
```

### `app/articles/[slug]/page.tsx` の設計

| 機能 | 実装 |
|---|---|
| ISR | `export const revalidate = 86400`（24 時間） |
| 静的生成 | `generateStaticParams` で既存記事 100 件を事前生成 |
| SEO | `generateMetadata` で OGP・Twitter Card・canonical URL を動的生成 |
| リッチリザルト | JSON-LD `@type: Article` スキーマ |
| 本文レンダリング | `dangerouslySetInnerHTML`（自社 Claude パイプライン生成のため XSS リスクなし） |

### Vercel Cron 設定（初版）

```json
{
  "crons": [
    { "path": "/api/cron/generate-content", "schedule": "0 18 * * *" }
  ]
}
```

`0 18 * * *` (UTC) = 毎日 **03:00 JST**

---

## セッション 3: Stripe 連携・エラー監視・Self-healing・ミドルウェア・レート制限

### 目的

本番運用に必要なサブスクリプション課金・自動エラー修復・セキュリティ機能を実装する。

### 追加パッケージ

```bash
npm install stripe @upstash/redis @upstash/ratelimit
```

### 作成・更新ファイル一覧

| ファイル | 役割 |
|---|---|
| `supabase/migrations/002_create_subscriptions.sql` | subscriptions テーブル |
| `supabase/migrations/003_create_error_logs.sql` | error_logs テーブル |
| `lib/rate-limit.ts` | Upstash Redis レートリミッター（fail-open） |
| `lib/notify.ts` | LINE Notify / Slack Webhook 通知（critical のみ） |
| `lib/self-heal.ts` | Claude + GitHub API で自動コード修復 → PR 作成 |
| `middleware.ts` | Supabase Auth + プレミアムガード |
| `app/api/stripe/checkout/route.ts` | Stripe Checkout Session 作成 |
| `app/api/stripe/webhook/route.ts` | `payment_intent.succeeded` 処理 |
| `app/api/cron/health-check/route.ts` | エラー監視 Cron |
| `types/index.ts` | `Subscription` / `ErrorLog` 型を追加 |
| `vercel.json` | health-check Cron スケジュール追加 |
| `.env.local.example` | 全環境変数テンプレートを更新 |

### 1. DB マイグレーション

#### `subscriptions` テーブル

```sql
CREATE TABLE subscriptions (
  id                       uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id       text  UNIQUE,
  stripe_subscription_id   text  UNIQUE,
  stripe_payment_intent_id text,
  plan                     text  NOT NULL DEFAULT 'free',   -- 'free' | 'premium'
  status                   text  NOT NULL DEFAULT 'active', -- 'active' | 'canceled' | 'past_due'
  current_period_end       timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
-- RLS: 本人のみ読み取り可 (auth.uid() = user_id)
-- 書き込み: サービスロールのみ（Stripe Webhook 専用）
```

#### `error_logs` テーブル

```sql
CREATE TABLE error_logs (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  route         text    NOT NULL,
  error_message text    NOT NULL,
  stack_trace   text,
  source_file   text,
  severity      text    NOT NULL DEFAULT 'error', -- 'warning' | 'error' | 'critical'
  count         integer NOT NULL DEFAULT 1,
  resolved      boolean NOT NULL DEFAULT false,
  heal_pr_url   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- RLS: サービスロールのみ読み書き可
-- インデックス: route / severity / resolved(partial) / created_at
```

### 2. Rate Limiting (`lib/rate-limit.ts`)

Upstash Redis を使用。**環境変数未設定時は fail-open**（常に通過）で開発環境を壊さない。

| プリセット | 対象 | 制限 | アルゴリズム |
|---|---|---|---|
| `limitApi` | 通常 API | 10 req / 1 分 | Sliding Window |
| `limitWebhook` | Stripe Webhook | 100 req / 1 分 | Sliding Window |
| `limitCron` | Cron Job | 1 req / 1 時間 | Fixed Window |

```typescript
// 全 API ルートの冒頭で使用するパターン
const { success } = await limitApi(getClientIp(request))
if (!success) return Response.json({ error: 'Too Many Requests' }, { status: 429 })
```

### 3. Stripe 連携

#### Checkout Session (`app/api/stripe/checkout/route.ts`)

```
POST /api/stripe/checkout
  ↓
1. IP レートリミット
2. Supabase Auth でユーザー認証
3. 二重申込みチェック（既に premium & active なら 400）
4. stripe.checkout.sessions.create()
   └─ metadata.user_id と subscription_data.metadata.user_id に userId を埋め込む
5. { url: session.url } を返す
```

#### Webhook (`app/api/stripe/webhook/route.ts`)

- `stripe.webhooks.constructEvent()` で**署名検証**（raw body = `request.text()` が必要）
- `payment_intent.succeeded` イベントのみ処理

**ユーザー特定ロジック（2段階）**:

```
1. paymentIntent.metadata.user_id → 初回支払いで直接取得
2. なければ stripe_customer_id で Supabase を検索 → サブスク更新時（renewal）に対応
```

**Stripe v22 (API 2026-04-22.dahlia) 対応**:

| 変更点 | 旧コード | 新コード |
|---|---|---|
| `PaymentIntent.invoice` の削除 | `paymentIntent.invoice.subscription` | `stripe.subscriptions.list({ customer })` |
| `current_period_end` の移動 | `subscription.current_period_end` | `subscription.billing_cycle_anchor` で代用 |

**Stripe の遅延初期化パターン（全ファイル共通）**:

```typescript
// ❌ NG: モジュールレベルで初期化するとビルド時にクラッシュ
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// ✅ OK: ファクトリ関数でリクエスト時に初期化
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY が設定されていません')
  return new Stripe(key)
}
```

**冪等性**: `upsertSubscription()` で `onConflict: 'user_id'` を指定

### 4. エラー監視 + Self-healing

#### Health-check Cron (`app/api/cron/health-check/route.ts`)

スケジュール: `30 * * * *`（毎時 30 分）

```
直近 1 時間の error_logs（未解決 & count >= 3）を取得
  ↓
count >= 3         → GitHub Issue を自動起票（labels: ['bug', 'auto-generated']）
  ↓
severity = 'critical'
& count >= 5       → Self-heal 実行 + LINE/Slack 通知
```

#### Self-heal フロー (`lib/self-heal.ts`)

```
1. GitHub API でソースファイルを取得（base64 デコード）
   GET /repos/{owner}/{repo}/contents/{source_file}
     ↓
2. Claude API にエラー情報 + ソースコードを渡して修正コードを生成
   （system prompt に cache_control: ephemeral）
     ↓
3. main ブランチから新ブランチを作成
   GET /repos/{owner}/{repo}/git/ref/heads/main  → commit SHA 取得
   POST /repos/{owner}/{repo}/git/refs            → ブランチ作成
     ↓
4. 修正コードを base64 エンコードしてコミット
   PUT /repos/{owner}/{repo}/contents/{source_file}
     ↓
5. PR を作成して URL を返す
   POST /repos/{owner}/{repo}/pulls
     ↓
6. error_logs.heal_pr_url に PR URL を記録（冪等: 同一エラーへの重複修復を防止）
```

### 5. 通知 (`lib/notify.ts`)

**ノイズ削減ポリシー**: `severity = 'critical'` のみ通知。`warning` / `error` は GitHub Issue のみ。

| 通知先 | 環境変数 | 設定方法 |
|---|---|---|
| LINE Notify | `LINE_NOTIFY_TOKEN` | https://notify-bot.line.me/my/ |
| Slack | `SLACK_WEBHOOK_URL` | Incoming Webhook URL |

- 両方設定した場合は `Promise.allSettled()` で並行送信
- どちらも未設定の場合はスキップ（エラーにならない）

### 6. Middleware (`middleware.ts`)

```
全リクエスト（静的ファイル・Stripe Webhook を除く）
  ↓
Supabase セッション Cookie をリフレッシュ（期限切れトークンを自動更新）
  ↓
AUTH_REQUIRED_PREFIXES に一致
（/dashboard, /account, /api/stripe/checkout）
  → 未ログインなら /login?redirect={元パス} にリダイレクト
  ↓
PREMIUM_REQUIRED_PREFIXES に一致
（/dashboard/premium, /api/premium）
  → subscriptions テーブルを参照
  → plan != 'premium' または status != 'active' なら /upgrade にリダイレクト
```

```typescript
// matcher: Stripe Webhook を除外（raw body が必要、Middleware と競合しないよう）
matcher: ['/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)']
```

### Vercel Cron 設定（最終版）

```json
{
  "crons": [
    { "path": "/api/cron/generate-content", "schedule": "0 18 * * *" },
    { "path": "/api/cron/health-check",     "schedule": "30 * * * *" }
  ]
}
```

| Cron | UTC スケジュール | JST 換算 |
|---|---|---|
| generate-content | `0 18 * * *` | 毎日 03:00 |
| health-check | `30 * * * *` | 毎時 xx:30 |

---

## セッション 4: 法律書類ジェネレーター

### 目的

AI で日本語の契約書（業務委託 / 秘密保持 / 売買）を自動生成するメインツールを実装する。
無料ユーザーの月間制限（3回）・匿名ユーザー制限（1回）・プレミアム無制限を実現。

### 追加パッケージ

```bash
npm install react-hook-form zod @hookform/resolvers @radix-ui/react-label
```

### 作成・更新ファイル一覧

| ファイル | 役割 |
|---|---|
| `supabase/migrations/004_create_usages.sql` | usages テーブル + monthly_usages ビュー + RLS |
| `types/index.ts` | `Usage` / `MonthlyUsage` / `GenerateContractRequest` / `GenerateContractResponse` 型を追加 |
| `components/ui/input.tsx` | shadcn/ui Input コンポーネント |
| `components/ui/label.tsx` | shadcn/ui Label（`@radix-ui/react-label` ラッパー） |
| `components/ui/textarea.tsx` | shadcn/ui Textarea コンポーネント |
| `components/ui/form.tsx` | shadcn/ui Form（react-hook-form の Controller 完全ラッパー） |
| `components/ui/card.tsx` | shadcn/ui Card コンポーネント |
| `app/api/tools/generate-contract/route.ts` | 契約書生成 API |
| `app/tools/contract-generator/page.tsx` | 契約書ジェネレーター UI（Client Component） |

### 1. DB マイグレーション

#### `usages` テーブル

```sql
CREATE TABLE usages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE, -- 匿名は NULL
  identifier  text        NOT NULL,  -- ログイン済み = user_id, 匿名 = 'anon:{IP}'
  tool_name   text        NOT NULL,  -- 'contract-generator' など
  used_at     timestamptz NOT NULL DEFAULT now()
);
-- インデックス: (identifier, tool_name, date_trunc('month', used_at)) で月間集計を高速化
-- RLS: 認証済みユーザーは自分のレコードのみ読み取り可、書き込みはサービスロールのみ
```

#### `monthly_usages` ビュー

```sql
CREATE OR REPLACE VIEW monthly_usages AS
SELECT
  identifier,
  tool_name,
  date_trunc('month', used_at) AS month,
  count(*)::integer             AS usage_count
FROM usages
GROUP BY identifier, tool_name, date_trunc('month', used_at);
```

### 2. 利用制限ロジック

#### 識別子とプランごとの月間上限

| ユーザー種別 | identifier | 月間上限 |
|---|---|---|
| 匿名（未ログイン） | `anon:{IP}` | 1 回 |
| 無料ユーザー | `{user_id}` | 3 回 |
| プレミアムユーザー | — | 無制限 |

#### API 処理フロー

```
POST /api/tools/generate-contract
  ↓
1. IP レートリミット（limitApi: 10 req/min）
2. Supabase Auth でユーザー確認（未ログインでも通過）
3. Zod バリデーション（contractType / partyA / partyB / description 必須）
4. subscriptions テーブルを参照してプラン判定
5. monthly_usages ビューで当月利用回数チェック
   → 上限超過なら 429 + 日本語エラーメッセージ
6. Claude API 呼び出し（claude-sonnet-4-6、プロンプトキャッシュ有効）
7. <article> タグの存在を簡易検証
8. usages テーブルに INSERT（admin client で RLS バイパス）
9. { html, remainingUses } を返す
```

#### エラーハンドリング方針

| エラー種別 | 対処 |
|---|---|
| Claude API エラー | `error_logs` テーブルに記録後 500 を返す |
| usages INSERT 失敗 | コンソールログのみ（生成結果は返す） |
| monthly_usages 参照エラー | fail-open（0回として扱い処理継続） |

### 3. Claude プロンプト設計

**システムプロンプト**（`cache_control: { type: 'ephemeral' }` でキャッシュ）:

- `<article>` タグで全体を囲む
- `<h1>` に契約書名、`<h2>` に「第X条（条項名）」形式
- コードブロック記法（` ```html `）禁止
- 契約種別ごとの記載すべき条項ガイドライン（業務委託 / NDA / 売買）

**ユーザープロンプト**: 契約種別・甲乙名・期間・金額・主要条件を構造化テキストで渡す

**出力検証**: `<article>` / `</article>` タグの存在チェック（簡易）

### 4. フォーム UI 設計

**フォームフィールド一覧**:

| フィールド | 必須 | 型 | バリデーション |
|---|---|---|---|
| 契約書の種類 | ✅ | select | 3 択から選択必須 |
| 甲の名称 | ✅ | text input | min 1 / max 100 文字 |
| 乙の名称 | ✅ | text input | min 1 / max 100 文字 |
| 契約期間 | — | text input | max 100 文字 |
| 報酬・金額 | — | text input | max 100 文字 |
| 主要条件 | ✅ | textarea | min 10 / max 2000 文字 |

**UX 特徴**:
- 契約種別切替で甲・乙のプレースホルダーが動的に変化（委託者/受託者 etc.）
- 生成中は `Loader2` アニメーション + 「10〜30秒かかります」表示
- 生成結果はページ内インラインプレビュー（Tailwind prose クラスで整形）
- **HTML ダウンロード**: スタイル付き完全 HTML として出力
- **残り回数バッジ**: プレミアム=緑、残り1回=黄、0回=赤

**技術選択**:

| 項目 | 採用 | 理由 |
|---|---|---|
| フォーム管理 | `react-hook-form` + `zodResolver` | リアルタイムバリデーション |
| Select UI | native `<select>` + shadcn クラス | `@radix-ui/react-select` は依存が重く 3 択には過剰 |
| Form コンポーネント | 手動作成 `form.tsx` | shadcn CLI を使わず既存 globals.css を維持 |

---

## セッション 5: Vercel 本番デプロイ

### 目的

セッション 1〜4 で構築したアプリを Vercel に本番デプロイし、動作確認を完了する。

### 実施内容

#### 1. `.env.local` の作成

`C:\Users\tkouno\pj5000\.env.local` を新規作成。以下の値を設定：

| 変数名 | 設定値 | 備考 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xgvjvmhkknixndjiknfn.supabase.co` | 確定済み |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` | 確定済み |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` | 確定済み |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Anthropic コンソールで発行 |
| `CRON_SECRET` | `415dd16c...` | `node -e "require('crypto').randomBytes(32).toString('hex')"` で生成 |
| `NEXT_PUBLIC_APP_URL` | `https://pj50000.vercel.app` | デプロイ後に確定 |
| `STRIPE_SECRET_KEY` | `sk_test_dummy` | Stripe 未契約のためダミー |
| `STRIPE_WEBHOOK_SECRET` | `whsec_dummy` | 同上 |
| `STRIPE_PREMIUM_PRICE_ID` | `price_dummy` | 同上 |

`.gitignore` に `.env.local` が既に含まれていることを確認済み（14行目）。

#### 2. GitHub リポジトリの作成・Push

```bash
# リポジトリ初期化
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/nobinobi9000/pj50000.git
git push -u origin main
```

- GitHub アカウント: `nobinobi9000`
- リポジトリ名: `pj50000`（0が4つ）
- 44ファイル、10,857行をプッシュ

#### 3. Vercel Cron スケジュール修正

Vercel Hobby プランは **Cron が1日1回まで**の制限がある。
`health-check` の `30 * * * *`（毎時）が制限に引っかかったため修正：

```json
// 修正前
{ "path": "/api/cron/health-check", "schedule": "30 * * * *" }

// 修正後（毎日 04:00 JST）
{ "path": "/api/cron/health-check", "schedule": "0 19 * * *" }
```

#### 4. Vercel プロジェクト作成

- Vercel アカウント: `nobinobi9000`（Hobby プラン）
- プロジェクト名: `pj50000`
- 本番 URL: **https://pj50000.vercel.app**
- GitHub リポジトリと連携済み（`main` ブランチへの push で自動デプロイ）

#### 5. 環境変数の設定

Vercel Dashboard → Settings → Environments → Production から全変数を設定。
（新 UI では「Build and Deployment」ではなく「Environments → Production」配下）

#### 6. 動作確認結果

| URL | 結果 |
|---|---|
| `https://pj50000.vercel.app` | ✅ トップページ表示 |
| `https://pj50000.vercel.app/tools/contract-generator` | ✅ フォーム表示・生成成功 |

**契約書生成テスト結果**:
- 入力: 業務委託契約書 / 株式会社テスト / フリーランス太郎 / 月額330,000円
- 出力: 第1条〜第15条（業務内容・著作権・秘密保持・損害賠償・準拠法・管轄等）完備の HTML 契約書
- HTML ダウンロード: `契約書_2026-05-11.html` として正常出力

---

### 発生したトラブルと解決策

| # | 問題 | 原因 | 解決策 |
|---|---|---|---|
| 1 | Vercel プロジェクト名が重複エラー | 同名プロジェクトが既に存在 | 既存の `pj50000` プロジェクトを使用 |
| 2 | Cron エラー「would run more than once per day」 | Hobby プランは Cron 1日1回制限 | `health-check` を `30 * * * *` → `0 19 * * *` に変更 |
| 3 | 契約書生成エラー「credit balance is too low」 | Anthropic API のクレジット残高 $0 | Anthropic コンソールでクレジット購入後に解決 |
| 4 | 「はじめる」「詳しく見る」ボタンが 404 | リンク先ページ（/login, /features 等）が未実装 | 今後の実装課題（想定内） |

---

### 現在の稼働状況

| 機能 | 状態 | URL |
|---|---|---|
| トップページ | ✅ 稼働中 | https://pj50000.vercel.app |
| 法律書類ジェネレーター | ✅ 稼働中・動作確認済み | https://pj50000.vercel.app/tools/contract-generator |
| SEO 記事自動生成 Cron | ✅ 設定済み（毎日 03:00 JST） | /api/cron/generate-content |
| ヘルスチェック Cron | ✅ 設定済み（毎日 04:00 JST） | /api/cron/health-check |
| Supabase DB | ✅ 接続済み・Migration 001〜004 実行済み | - |
| Stripe 連携 | ⏳ 未契約（ダミー値で稼働中） | - |
| Upstash Redis | ⏳ 未設定（fail-open で稼働） | - |

---

## セッション 6: AdSense 審査対応・記事生成改善・UI 改善

### 目的

Google AdSense 審査通過に必要なページ整備、ナビゲーション追加、記事自動生成パイプラインの品質改善、記事詳細ページの読みやすさ向上を行う。

### 追加パッケージ

```bash
npm install @tailwindcss/typography
```

### 作成・更新ファイル一覧

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `components/header.tsx` | 新規作成 | サイトナビゲーションヘッダー |
| `components/footer.tsx` | 新規作成 | フッター（コピーライト・リンク・運営者情報） |
| `app/layout.tsx` | 更新 | Header/Footer 組み込み + SEO メタデータ刷新 |
| `app/page.tsx` | 更新 | トップページ全面刷新 |
| `app/articles/page.tsx` | 新規作成 | 記事一覧ページ（ISR・50件） |
| `app/articles/[slug]/page.tsx` | 更新 | 記事詳細ページのデザイン大幅改善 |
| `app/privacy/page.tsx` | 新規作成 | プライバシーポリシー（AdSense 必須） |
| `app/terms/page.tsx` | 新規作成 | 利用規約（AI 免責条項含む） |
| `app/contact/page.tsx` | 新規作成 | お問い合わせページ |
| `app/api/cron/generate-content/route.ts` | 更新 | JSON パース修正・topicIndex パラメータ追加 |
| `lib/content-generator.ts` | 更新 | トピック一覧を法律系に刷新・プロンプト改善 |
| `tailwind.config.ts` | 更新 | `@tailwindcss/typography` プラグイン追加 |
| `.env.local` | 更新 | `NEXT_PUBLIC_APP_URL` を本番 URL に修正 |

---

### 1. ナビゲーションヘッダー・フッター

#### `components/header.tsx`

- 左: サイト名「法律書類ジェネレーター」（`/` へリンク）
- 右: 「記事一覧」「契約書を作る」「プライバシーポリシー」「お問い合わせ」
- `sticky top-0` + `backdrop-blur` でスクロール時も固定表示
- スマホ対応: `flex-wrap` で縦並び

#### `components/footer.tsx`

- 「© 2026 法律書類ジェネレーター」
- プライバシーポリシー / 利用規約 / お問い合わせへのリンク
- 「運営者情報: 個人運営」記載

#### `app/layout.tsx` の更新

```tsx
<div className="flex min-h-screen flex-col">
  <Header />
  <main className="flex-1">{children}</main>
  <Footer />
</div>
```

SEO メタデータも刷新：

| 項目 | 設定値 |
|---|---|
| `title.default` | `法律書類ジェネレーター \| 契約書・内容証明を無料で自動作成` |
| `description` | 契約書・内容証明・利用規約などの法律書類をAIが瞬時に生成。 |
| `keywords` | 契約書 自動作成 / AI / 無料 / 業務委託 / 利用規約 自動生成 など |
| `openGraph.locale` | `ja_JP` |
| `metadataBase` | `new URL(APP_URL)` |

---

### 2. AdSense 審査必須ページ

#### `app/privacy/page.tsx` - プライバシーポリシー

AdSense・Analytics の記載を含む全 12 条構成。主な内容：
- 収集する情報・利用目的
- **Google AdSense の Cookie・オプトアウト方法（必須）**
- **Google Analytics のデータ収集説明（必須）**
- 第三者提供・未成年者・問い合わせ先

#### `app/terms/page.tsx` - 利用規約

AI 生成物に関する免責条項を含む全 12 条構成。主な内容：
- **AIによる生成物の免責（法的アドバイスではない旨）**
- 禁止事項・無料利用の範囲（3回まで）
- 知的財産権・サービス変更・損害賠償制限

#### `app/contact/page.tsx` - お問い合わせ

- Google フォームへの外部リンク（`https://forms.gle/example`）
- メールアドレス記載（`info@pj50000.example.com`）
- 「法律相談・弁護士紹介には対応しておりません」の注意書き

---

### 3. トップページ刷新（`app/page.tsx`）

**旧**: `pj5000 へようこそ`（プレースホルダー）、CTAが `/dashboard`・`/about` に向いていて 404

**新**: 4セクション構成

| セクション | 内容 |
|---|---|
| ヒーロー | キャッチコピー + 「無料で書類を作成する」→`/tools/contract-generator` + 「法律コラムを読む」→`/articles` |
| 機能紹介 | 「AIが瞬時に生成」「法律的な観点で作成」「無料で3回まで」の3カード |
| 最新記事 | Supabase から最新3件取得・カード表示（ISR 24時間） |
| 下部 CTA | 「今すぐ無料で試してみる」ボタン |

---

### 4. 記事一覧ページ（`app/articles/page.tsx`）

- ISR: `revalidate = 86400`（24 時間）
- Supabase から `published_at` 降順 50 件取得
- グリッドカード表示（Calendar アイコン・タイトル・概要・「続きを読む →」）
- 記事ゼロ時は FileText アイコン付き空状態 UI
- OGP・Twitter Card・canonical URL 付き

---

### 5. 記事詳細ページ改善（`app/articles/[slug]/page.tsx`）

**問題**: `prose` クラスが効いていなかった（`@tailwindcss/typography` 未インストール）

**改善内容**:

| 変更前 | 変更後 |
|---|---|
| prose が未適用でHTML素出力 | typography プラグインで見出し・段落・リスト・コード整形 |
| タイトルと日付のみ | パンくずリスト + カテゴリバッジ + リード文（meta_description） |
| 本文がベタ流し | h2 に左ボーダーアクセント、行間 1.8、コードは専用スタイル |
| 記事で終わり | 下部に「契約書作成 CTA」+ 「コラム一覧へ戻る」リンク |

```tsx
// prose クラス設定例
className="
  prose prose-slate max-w-none
  prose-h2:border-l-4 prose-h2:border-primary prose-h2:pl-3
  prose-p:leading-8
  prose-pre:bg-muted prose-code:bg-primary/10
  ...
"
```

---

### 6. 記事生成パイプラインの改善

#### 問題①: JSON パースエラー

**症状**: `POST /api/cron/generate-content` が 500 を返す
**原因**: Claude が JSON の `body` フィールド内に実際の改行文字（`\n` でなくリテラル改行）を出力し、`JSON.parse()` が失敗

**修正①** - `sanitizeJsonString()` 関数を追加（`route.ts`）:

```typescript
function sanitizeJsonString(json: string): string {
  // JSON文字列値の内部を文字単位でスキャンし、
  // 生の改行文字を \n エスケープシーケンスに変換する
  let inString = false
  // ... 省略 ...
}
```

**修正②** - システムプロンプトに明示指示（`content-generator.ts`）:

```
## JSON出力における厳守事項
- 実際の改行文字を含めない（\n で表現すること）
- ダブルクォートは \" としてエスケープすること
```

#### 問題②: トピックがサイトと無関係

**症状**: 生成記事が Next.js・TypeScript 等の技術系内容になっていた
**原因**: `TOPIC_SEEDS` が技術系トピックで定義されていた

**修正**: トピック 20 件を法律・契約・ビジネス法務に全面刷新

| 旧トピック（例） | 新トピック（例） |
|---|---|
| `Next.js App Router のパフォーマンス最適化` | `業務委託契約書の作り方と必須条項` |
| `TypeScript の型安全を極める実践テクニック10選` | `秘密保持契約書（NDA）の書き方と注意点` |
| `Supabase Auth でソーシャルログインを5分で実装する` | `内容証明郵便の書き方と使い方` |

新トピック一覧（全 20 件）：

1. 業務委託契約書の作り方と必須条項
2. 秘密保持契約書（NDA）の書き方と注意点
3. 雇用契約書と業務委託契約の違い
4. 売買契約書の基本構成と作成手順
5. 利用規約の作り方
6. 内容証明郵便の書き方と使い方
7. フリーランスの契約トラブル対策
8. 損害賠償条項の書き方
9. 契約書の電子署名・電子契約
10. 著作権譲渡と利用許諾の違い
11. 競業避止義務条項の有効性と限界
12. 請負契約と準委任契約の違い
13. 個人情報取扱同意書の作り方
14. 契約書の印紙税
15. クーリングオフ制度の使い方
16. 賃貸借契約書のチェックポイント
17. 下請法の基礎知識
18. 契約の解除と解約の違い
19. 債権回収の手順と法的手段
20. 会社設立時に必要な契約書一覧

#### 問題③: 同日に1記事しか生成できない

**症状**: 10本一気に生成しようとしても、2本目から「本日分はすでに生成済みです」と返る
**原因**: スラッグが `article-{topicIndex}-{YYYY-MM-DD}` の形式で、同日・同トピックは重複チェックで弾かれる設計

**修正**: `?topicIndex=N` クエリパラメータを追加

```typescript
// 手動バッチ生成時
GET /api/cron/generate-content?topicIndex=0  // 0番トピックで生成
GET /api/cron/generate-content?topicIndex=1  // 1番トピックで生成
// ...
```

**手動10本生成コマンド（PowerShell）**:

```powershell
$secret = "415dd16ccbab80c3fd0d4c77a14a01773f612f1d2bbae13a57fa47037291bb49"
foreach ($idx in 0..9) {
  Invoke-WebRequest `
    -Uri "https://pj50000.vercel.app/api/cron/generate-content?topicIndex=$idx" `
    -Headers @{"Authorization"="Bearer $secret"} `
    -Method GET -UseBasicParsing
  Start-Sleep -Seconds 20
}
```

---

### 7. 記事の手動生成と Supabase 管理

#### Supabase 記事の削除方法

サービスロールキーを PowerShell の `Invoke-WebRequest` で使うと Supabase 側でブロックされる（「Forbidden use of secret API key in browser」）。

**正しい削除方法**: Supabase ダッシュボード → Table Editor → articles → 行選択 → Delete

#### 生成済み記事確認

```
GET https://xgvjvmhkknixndjiknfn.supabase.co/rest/v1/articles
  ?select=id,slug,title,published_at
  &order=published_at.desc
  &apikey={ANON_KEY}
```

---

### 8. 稼働確認結果（セッション 6 時点）

| ページ | URL | 状態 |
|---|---|---|
| トップ | https://pj50000.vercel.app | ✅ |
| 法律コラム一覧 | https://pj50000.vercel.app/articles | ✅ 法律記事10本表示 |
| 記事詳細 | https://pj50000.vercel.app/articles/article-0-2026-05-11 | ✅ typography 適用済み |
| プライバシーポリシー | https://pj50000.vercel.app/privacy | ✅ |
| 利用規約 | https://pj50000.vercel.app/terms | ✅ |
| お問い合わせ | https://pj50000.vercel.app/contact | ✅ |
| 契約書ジェネレーター | https://pj50000.vercel.app/tools/contract-generator | ✅ |

#### ビルド結果（セッション 6 最終）

```
Route (app)                              Size     First Load JS
┌ ○ /                                    859 B          96.8 kB
├ ○ /articles                            861 B          96.8 kB
├ ● /articles/[slug]                     145 B          87.4 kB
├ ○ /contact                             859 B          96.8 kB
├ ○ /privacy                             145 B          87.4 kB
├ ○ /terms                               145 B          87.4 kB
└ ○ /tools/contract-generator            43.3 kB         131 kB
```

全ページ静的生成（`○`）で TypeScript strict エラーなし。

---

### 発生したトラブルと解決策

| # | 問題 | 原因 | 解決策 |
|---|---|---|---|
| 1 | Cron が 500 エラー | ClaudeのJSON出力に生改行文字が混入 | `sanitizeJsonString()` で前処理 + プロンプトに明示指示 |
| 2 | 記事が技術系になっている | `TOPIC_SEEDS` が技術系だった | 法律・契約系 20 件に全面刷新 |
| 3 | 同日に1本しか生成できない | slug が日付+トピック固定のため重複ブロック | `?topicIndex=N` パラメータで任意トピックを指定可能に |
| 4 | prose クラスが効かない | `@tailwindcss/typography` 未インストール | インストール + `tailwind.config.ts` に追加 |
| 5 | 古い記事がページに残る | ISR 24 時間キャッシュのため即時反映されない | 空コミット push → Vercel 再デプロイでクリア |
| 6 | Supabase DELETE が 403 | サービスロールキーをクライアントから送信するとブロックされる | Supabase ダッシュボードの Table Editor から直接削除 |
| 7 | GitHub push が 500 エラー | GitHub 側の一時的な障害 | しばらく待って再 push |
| 8 | `.env.local` の `NEXT_PUBLIC_APP_URL` が無効 | プレースホルダーのまま（日本語説明文）だった | `https://pj50000.vercel.app` に修正 |

---

## 最終ファイル構成

```
pj5000/
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   ├── generate-content/route.ts  ← 法律記事生成 Cron（?topicIndex=N 対応）
│   │   │   └── health-check/route.ts      ← エラー監視 + Self-heal Cron
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts          ← Stripe Checkout Session 作成
│   │   │   └── webhook/route.ts           ← payment_intent.succeeded 処理
│   │   └── tools/
│   │       └── generate-contract/route.ts ← 契約書生成 API
│   ├── articles/
│   │   ├── [slug]/page.tsx               ← ISR 記事詳細（OGP + JSON-LD + typography）★S6
│   │   └── page.tsx                      ← 記事一覧（ISR・50件・カードグリッド）★S6
│   ├── contact/
│   │   └── page.tsx                      ← お問い合わせ（AdSense必須）★S6
│   ├── privacy/
│   │   └── page.tsx                      ← プライバシーポリシー（AdSense必須）★S6
│   ├── terms/
│   │   └── page.tsx                      ← 利用規約（AI免責含む）★S6
│   ├── tools/
│   │   └── contract-generator/page.tsx   ← 法律書類ジェネレーター
│   ├── globals.css
│   ├── layout.tsx                        ← Header/Footer 組み込み + SEO 刷新★S6
│   └── page.tsx                          ← トップページ（ヒーロー+機能+記事+CTA）★S6
├── components/
│   ├── header.tsx                        ← ナビゲーションヘッダー★S6
│   ├── footer.tsx                        ← フッター★S6
│   └── ui/
│       ├── button.tsx
│       ├── card.tsx
│       ├── form.tsx
│       ├── input.tsx
│       ├── label.tsx
│       └── textarea.tsx
├── lib/
│   ├── content-generator.ts              ← 法律系トピック20件・プロンプト★S6更新
│   ├── notify.ts
│   ├── rate-limit.ts
│   ├── self-heal.ts
│   ├── supabase-admin.ts
│   ├── supabase-server.ts
│   ├── supabase.ts
│   └── utils.ts
├── supabase/migrations/
│   ├── 001_create_articles.sql
│   ├── 002_create_subscriptions.sql
│   ├── 003_create_error_logs.sql
│   └── 004_create_usages.sql
├── types/
│   └── index.ts
├── .env.local                            ← NEXT_PUBLIC_APP_URL を本番URLに修正★S6
├── .env.local.example
├── .gitignore
├── components.json
├── middleware.ts
├── next.config.mjs
├── package.json                          ← @tailwindcss/typography 追加★S6
├── postcss.config.js
├── tailwind.config.ts                    ← typography プラグイン追加★S6
├── tsconfig.json
└── vercel.json

★S6 = セッション6で新規作成または更新
```

---

## 環境変数一覧

`.env.local.example` に全て記載済み。

| 変数名 | 用途 | 必須 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名キー | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 管理キー（サーバー専用） | ✅ |
| `ANTHROPIC_API_KEY` | Claude API キー | ✅ |
| `STRIPE_SECRET_KEY` | Stripe シークレットキー | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 署名シークレット | ✅ |
| `STRIPE_PREMIUM_PRICE_ID` | プレミアムプランの Price ID | ✅ |
| `CRON_SECRET` | Cron 認証シークレット（`openssl rand -hex 32`） | ✅ |
| `NEXT_PUBLIC_APP_URL` | アプリの公開 URL（例: `https://example.vercel.app`） | ✅ |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | 任意 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis トークン | 任意 |
| `GITHUB_TOKEN` | GitHub PAT（repo スコープ） | 任意 |
| `GITHUB_REPO_OWNER` | GitHub ユーザー名 / Org 名 | 任意 |
| `GITHUB_REPO_NAME` | リポジトリ名（例: `pj5000`） | 任意 |
| `LINE_NOTIFY_TOKEN` | LINE Notify トークン | 任意 |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL | 任意 |

> **注意**: `UPSTASH_*` が未設定の場合、レートリミットは fail-open（常に通過）になる。
> `GITHUB_*` が未設定の場合、Self-heal は実行されない。

---

## Vercel デプロイ手順

### 1. リポジトリを Vercel に接続

Vercel Dashboard > New Project > GitHub リポジトリを選択

### 2. 環境変数を設定

Settings > Environment Variables で上表の必須変数を全て設定する。

### 3. Supabase でマイグレーションを実行

Supabase ダッシュボード > SQL Editor で順番に実行:

```sql
-- 001: articles テーブル
\i supabase/migrations/001_create_articles.sql

-- 002: subscriptions テーブル
\i supabase/migrations/002_create_subscriptions.sql

-- 003: error_logs テーブル
\i supabase/migrations/003_create_error_logs.sql

-- 004: usages テーブル + monthly_usages ビュー
\i supabase/migrations/004_create_usages.sql
```

### 4. Stripe Webhook を設定

1. Stripe ダッシュボード > Developers > Webhooks > Add endpoint
2. エンドポイント URL: `https://your-domain.vercel.app/api/stripe/webhook`
3. イベント: `payment_intent.succeeded` のみ選択
4. Signing secret を Vercel の `STRIPE_WEBHOOK_SECRET` に設定

### 5. デプロイ

`main` ブランチにプッシュ → Vercel が自動ビルド・デプロイ

---

## 累積ビルド検証結果

### セッション 4 時点（最新）

```
Route (app)                              Size     First Load JS
┌ ○ /                                    8.88 kB        96.1 kB
├ ○ /_not-found                          873 B          88.1 kB
├ ƒ /api/cron/generate-content           0 B                0 B
├ ƒ /api/cron/health-check               0 B                0 B
├ ƒ /api/stripe/checkout                 0 B                0 B
├ ƒ /api/stripe/webhook                  0 B                0 B
├ ƒ /api/tools/generate-contract         0 B                0 B
├ ● /articles/[slug]                     137 B          87.4 kB
└ ○ /tools/contract-generator            43.2 kB         130 kB

ƒ Middleware                             81.7 kB
```

全ルートでビルドエラーなし（TypeScript strict mode 準拠）。

### 凡例

| 記号 | 意味 |
|---|---|
| `○` | Static: ビルド時に静的 HTML として事前レンダリング |
| `●` | SSG: getStaticProps を使う静的ページ（ISR 対応） |
| `ƒ` | Dynamic: リクエスト時にサーバーサイドレンダリング |

---

## 累積バグ・解決策一覧

| # | セッション | 問題 | 原因 | 解決策 |
|---|---|---|---|---|
| 1 | 1 | `create-next-app` が実行を拒否 | `.claude/` ディレクトリが存在していた | 全ファイルを手動作成に切り替え |
| 2 | 1 | `next.config.ts` がビルドエラー | Next.js 14 は `.ts` 形式の設定ファイル非対応 | `next.config.mjs` に変更（ESM `export default`） |
| 3 | 1 | `string \| undefined` 型エラー | `createBrowserClient` は `string` 必須だが env は `undefined` の可能性 | `requireEnv()` ヘルパーで `string` を保証 |
| 4 | 1 | Supabase Database generic 型エラー (`never[]`) | 型生成（CLI）なしに `createClient<Database>` を使用 | Generic を削除し呼び出し側でキャスト |
| 5 | 2 | `supabaseUrl is required`（ビルド時クラッシュ） | `generateStaticParams` がビルド時に実行され Supabase クライアントが初期化 | 環境変数チェックを追加し未設定なら空配列を返す |
| 6 | 3 | `new Stripe()` でビルドクラッシュ | モジュールレベルで Stripe を初期化すると env が未設定のビルド時に例外 | `getStripe()` ファクトリ関数で遅延初期化 |
| 7 | 3 | `paymentIntent.invoice` 型エラー | Stripe v22 (API 2026-04-22.dahlia) で `PaymentIntent` から `invoice` フィールドが削除 | `stripe.subscriptions.list({ customer, status: 'active' })` で代替 |
| 8 | 3 | `subscription.current_period_end` 型エラー | Stripe v22 で `current_period_end` が `Subscription` から `SubscriptionItem` に移動 | `subscription.billing_cycle_anchor` で代用 |
| 9 | 3 | `string \| null` が `string` に代入できない（webhook） | `Stripe.Metadata = Record<string,string>` のため `??` の結果が `string` に推論される | `let userId: string \| null = ...` と明示的に型注釈 |
| 10 | 4 | `z.enum()` の `required_error` / `invalid_type_error` が型エラー | Zod v4（4.4.3）でオプション名が変更された | `{ message: '...' }` に変更 |
| 11 | 4 | `parsed.error.errors` が型エラー | Zod v4 でイシューは `.errors` ではなく `.issues` プロパティ | `parsed.error.issues[0]` に修正 |
| 12 | 5 | Vercel デプロイ時「Project already exists」エラー | 同名プロジェクトが Vercel に既に存在していた | 既存プロジェクト `pj50000` を流用 |
| 13 | 5 | Vercel Cron「would run more than once per day」エラー | Hobby プランは Cron 1日1回まで制限あり | `health-check` スケジュールを `30 * * * *` → `0 19 * * *` に変更 |
| 14 | 5 | 契約書生成「credit balance is too low」エラー | Anthropic API クレジット残高 $0 | Anthropic コンソールでクレジット購入後に解決 |
| 15 | 6 | Cron が 500 エラー | Claude の JSON 出力に実際の改行文字が混入し `JSON.parse()` 失敗 | `sanitizeJsonString()` で前処理 + プロンプトに JSON 厳守事項を追記 |
| 16 | 6 | 記事が法律と無関係の技術系 | `TOPIC_SEEDS` が Next.js・TypeScript 等の技術トピックだった | 法律・契約・ビジネス法務 20 件に全面刷新 |
| 17 | 6 | 同日に 2 本目以降「すでに生成済み」で弾かれる | slug が `article-{idx}-{date}` 固定で重複チェックに引っかかる | `?topicIndex=N` パラメータで任意トピックを強制指定できるよう修正 |
| 18 | 6 | `prose` クラスが効かず HTML が素出力 | `@tailwindcss/typography` が未インストール | パッケージインストール + `tailwind.config.ts` の plugins に追加 |
| 19 | 6 | 古い記事が articles ページに残る | ISR 24 時間キャッシュが有効 | 空コミット push → Vercel 再デプロイでキャッシュクリア |
| 20 | 6 | Supabase REST DELETE が 403 | PowerShell から Service Role Key を使うと Supabase がブロック | Supabase ダッシュボード Table Editor から手動削除 |
| 21 | 6 | `NEXT_PUBLIC_APP_URL` が Invalid URL でビルドエラー | `.env.local` にプレースホルダー（日本語説明文）が残ったまま | `https://pj50000.vercel.app` に修正 |
| 22 | 6 | GitHub push が 500 エラー | GitHub 側の一時的なサーバー障害 | しばらく待って再 push で解決 |
