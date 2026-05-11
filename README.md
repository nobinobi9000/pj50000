# pj5000

## 概要

pj5000 は〇〇を実現するための Next.js アプリケーションです。

## 技術スタック

| カテゴリ | 採用技術 |
|---|---|
| フレームワーク | Next.js 14 (App Router) + TypeScript strict |
| スタイリング | Tailwind CSS v3 + shadcn/ui |
| バックエンド | Supabase (認証 / PostgreSQL / Storage) |
| デプロイ | Vercel |

## ディレクトリ構成

```
app/           # Next.js App Router のページとレイアウト
components/    # React コンポーネント（ui/ に shadcn/ui コンポーネント）
lib/           # 外部サービスのクライアント設定・ユーティリティ
  supabase.ts         # ブラウザ（クライアント）用 Supabase クライアント
  supabase-server.ts  # サーバーコンポーネント・Route Handler 用
  utils.ts            # cn() などのユーティリティ関数
types/         # TypeScript 型定義
```

## 開発環境のセットアップ

### 前提条件

- Node.js 18.17.0 以上
- npm 9 以上

### 手順

1. リポジトリをクローン

   ```bash
   git clone <repository-url>
   cd pj5000
   ```

2. 依存関係をインストール

   ```bash
   npm install
   ```

3. 環境変数を設定

   ```bash
   cp .env.local.example .env.local
   ```

   `.env.local` を開いて Supabase の認証情報を入力してください。

4. 開発サーバーを起動

   ```bash
   npm run dev
   ```

5. ブラウザで [http://localhost:3000](http://localhost:3000) を開く

## Supabase のセットアップ

1. [Supabase](https://supabase.com) でプロジェクトを作成
2. ダッシュボード > **Settings** > **API** から以下の値を取得
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `.env.local` に設定値を記入

## shadcn/ui コンポーネントの追加

```bash
npx shadcn@latest add <component-name>

# 例
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add form
```

追加したコンポーネントは `components/ui/` に生成されます。

## デプロイ（Vercel）

1. Vercel にリポジトリを接続
2. **Settings > Environment Variables** に以下を設定

   | 変数名 | 環境 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | 全環境 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 全環境 |
   | `SUPABASE_SERVICE_ROLE_KEY` | 本番のみ |

3. `main` ブランチにプッシュすると自動デプロイ

## スクリプト

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバーを起動（http://localhost:3000） |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバーを起動 |
| `npm run lint` | ESLint を実行 |
