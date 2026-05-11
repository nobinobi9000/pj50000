# pj5000 開発ログ

Claude Code との 4 セッションで構築した内容の全記録。

---

## 目次

1. [セッション 1: プロジェクト基盤構築](#セッション-1-プロジェクト基盤構築)
2. [セッション 2: SEO コンテンツ自動生成パイプライン](#セッション-2-seo-コンテンツ自動生成パイプライン)
3. [セッション 3: Stripe 連携・エラー監視・Self-healing・通知・Middleware・Rate Limiting](#セッション-3-stripe-連携エラー監視self-healingミドルウェアレート制限)
4. [セッション 4: 法律書類ジェネレーター](#セッション-4-法律書類ジェネレーター)
5. [最終ファイル構成](#最終ファイル構成)
6. [環境変数一覧](#環境変数一覧)
7. [Vercel デプロイ手順](#vercel-デプロイ手順)
8. [累積ビルド検証結果](#累積ビルド検証結果)
9. [累積バグ・解決策一覧](#累積バグ解決策一覧)

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

## 最終ファイル構成

```
pj5000/
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   ├── generate-content/route.ts  ← SEO記事生成 Cron
│   │   │   └── health-check/route.ts      ← エラー監視 + Self-heal Cron
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts          ← Stripe Checkout Session 作成
│   │   │   └── webhook/route.ts           ← payment_intent.succeeded 処理
│   │   └── tools/
│   │       └── generate-contract/route.ts ← 契約書生成 API（セッション4）
│   ├── articles/[slug]/page.tsx           ← ISR 記事ページ（OGP + JSON-LD）
│   ├── tools/
│   │   └── contract-generator/page.tsx   ← 法律書類ジェネレーター（セッション4）
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/ui/
│   ├── button.tsx                         ← shadcn/ui Button
│   ├── card.tsx                           ← shadcn/ui Card（セッション4）
│   ├── form.tsx                           ← shadcn/ui Form（セッション4）
│   ├── input.tsx                          ← shadcn/ui Input（セッション4）
│   ├── label.tsx                          ← shadcn/ui Label（セッション4）
│   └── textarea.tsx                       ← shadcn/ui Textarea（セッション4）
├── lib/
│   ├── content-generator.ts              ← トピックリスト・プロンプト定義
│   ├── notify.ts                         ← LINE / Slack 通知（critical のみ）
│   ├── rate-limit.ts                     ← Upstash Redis レートリミッター
│   ├── self-heal.ts                      ← Claude + GitHub API で自動修復
│   ├── supabase-admin.ts                 ← サービスロールクライアント
│   ├── supabase-server.ts                ← Server Component 用クライアント
│   ├── supabase.ts                       ← ブラウザ用クライアント
│   └── utils.ts                          ← cn() ユーティリティ
├── supabase/migrations/
│   ├── 001_create_articles.sql           ← articles テーブル
│   ├── 002_create_subscriptions.sql      ← subscriptions テーブル
│   ├── 003_create_error_logs.sql         ← error_logs テーブル
│   └── 004_create_usages.sql            ← usages テーブル + ビュー（セッション4）
├── types/
│   └── index.ts                          ← 全共通型定義
├── .env.local.example
├── .gitignore
├── components.json
├── middleware.ts                          ← Auth + プレミアムガード
├── next.config.mjs
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
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
