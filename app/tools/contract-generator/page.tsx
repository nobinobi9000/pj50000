// 法律書類ジェネレーター ページ
// 契約書の種類・当事者名・主要条件を入力し、Claude API で契約書 HTML を生成する
//
// - shadcn/ui Form + Zod バリデーション
// - 生成結果はページ内にプレビュー表示
// - 月間利用回数・残り回数をリアルタイム表示

'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, FileText, Download, AlertCircle, CheckCircle2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ContractType, GenerateContractResponse } from '@/types'

// ----------------------------------------------------------------
// Zod スキーマ（クライアント側バリデーション）
// ※ API 側の requestSchema と一致させること
// ----------------------------------------------------------------

const formSchema = z.object({
  // Zod v4: z.enum() の第2引数は { message } または文字列のみ
  contractType: z.enum(['service', 'nda', 'sales'] as const, {
    message: '契約書の種類を選択してください',
  }),
  partyA: z
    .string()
    .min(1, '甲の名称を入力してください')
    .max(100, '100文字以内で入力してください'),
  partyB: z
    .string()
    .min(1, '乙の名称を入力してください')
    .max(100, '100文字以内で入力してください'),
  period: z.string().max(100, '100文字以内で入力してください').optional(),
  amount: z.string().max(100, '100文字以内で入力してください').optional(),
  description: z
    .string()
    .min(10, '10文字以上入力してください')
    .max(2000, '2000文字以内で入力してください'),
})

type FormValues = z.infer<typeof formSchema>

// ----------------------------------------------------------------
// 契約書の種類 オプション
// ----------------------------------------------------------------

const CONTRACT_TYPE_OPTIONS: { value: ContractType; label: string; description: string }[] = [
  {
    value: 'service',
    label: '業務委託契約書',
    description: '甲（委託者）が乙（受託者）に業務を委託する契約',
  },
  {
    value: 'nda',
    label: '秘密保持契約書（NDA）',
    description: '相互または一方的な秘密情報の保護に関する契約',
  },
  {
    value: 'sales',
    label: '売買契約書',
    description: '商品・サービスの売買に関する契約',
  },
]

// ----------------------------------------------------------------
// 甲・乙 のロール名（フォームのプレースホルダー用）
// ----------------------------------------------------------------

const PARTY_LABELS: Record<ContractType, { a: string; b: string }> = {
  service: { a: '委託者（例: 株式会社A）', b: '受託者（例: 株式会社B）' },
  nda: { a: '開示者（例: 株式会社A）', b: '受領者（例: 株式会社B）' },
  sales: { a: '売主（例: 株式会社A）', b: '買主（例: 株式会社B）' },
}

// ----------------------------------------------------------------
// 残り回数バッジ コンポーネント
// ----------------------------------------------------------------

function RemainingUsesBadge({ remaining }: { remaining: number | null }) {
  if (remaining === null) {
    // プレミアムユーザー
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
        <CheckCircle2 className="h-3 w-3" />
        無制限（プレミアム）
      </span>
    )
  }

  const color =
    remaining === 0
      ? 'text-red-600 bg-red-50 border-red-200'
      : remaining === 1
        ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-blue-600 bg-blue-50 border-blue-200'

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2.5 py-0.5 ${color}`}>
      <FileText className="h-3 w-3" />
      今月あと {remaining} 回
    </span>
  )
}

// ----------------------------------------------------------------
// メインページ コンポーネント
// ----------------------------------------------------------------

export default function ContractGeneratorPage() {
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [generatedHtml, setGeneratedHtml] = React.useState<string | null>(null)
  const [remainingUses, setRemainingUses] = React.useState<number | null | undefined>(
    undefined, // undefined = まだ取得していない
  )
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  // ----------------------------------------------------------------
  // react-hook-form セットアップ
  // ----------------------------------------------------------------

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contractType: 'service',
      partyA: '',
      partyB: '',
      period: '',
      amount: '',
      description: '',
    },
  })

  const watchedType = form.watch('contractType') as ContractType
  const partyLabels = PARTY_LABELS[watchedType] ?? PARTY_LABELS.service

  // ----------------------------------------------------------------
  // フォーム送信ハンドラー
  // ----------------------------------------------------------------

  async function onSubmit(values: FormValues) {
    setIsGenerating(true)
    setErrorMessage(null)
    setGeneratedHtml(null)

    try {
      const res = await fetch('/api/tools/generate-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const data: GenerateContractResponse & { error?: string } = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error ?? '契約書の生成に失敗しました')
        return
      }

      setGeneratedHtml(data.html)
      setRemainingUses(data.remainingUses)
    } catch {
      setErrorMessage('ネットワークエラーが発生しました。再度お試しください。')
    } finally {
      setIsGenerating(false)
    }
  }

  // ----------------------------------------------------------------
  // HTML ダウンロード
  // ----------------------------------------------------------------

  function handleDownload() {
    if (!generatedHtml) return

    const fullHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>契約書</title>
<style>
  body { font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #1a1a1a; }
  h1 { text-align: center; font-size: 1.5rem; margin-bottom: 2rem; border-bottom: 2px solid #1a1a1a; padding-bottom: 0.5rem; }
  h2 { font-size: 1rem; margin-top: 1.5rem; }
  p { margin: 0.5rem 0; }
  ol { padding-left: 1.5rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 2rem; }
  td { border: 1px solid #ccc; padding: 0.75rem; }
</style>
</head>
<body>
${generatedHtml}
</body>
</html>`

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `契約書_${new Date().toISOString().slice(0, 10)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ----------------------------------------------------------------
  // レンダリング
  // ----------------------------------------------------------------

  return (
    <main className="container max-w-3xl py-10 px-4">
      {/* ページヘッダー */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">法律書類ジェネレーター</h1>
            <p className="mt-2 text-muted-foreground">
              AI が日本語の契約書を自動生成します。内容を確認の上、必要に応じて専門家にレビューを依頼してください。
            </p>
          </div>
          {/* 残り回数バッジ（初回生成後に表示） */}
          {remainingUses !== undefined && (
            <div className="shrink-0 pt-1">
              <RemainingUsesBadge remaining={remainingUses} />
            </div>
          )}
        </div>
      </div>

      {/* 入力フォーム */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">契約書の情報を入力</CardTitle>
          <CardDescription>
            すべての必須項目を入力して「生成する」ボタンを押してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* 契約書の種類 */}
              <FormField
                control={form.control}
                name="contractType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      契約書の種類 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      {/* shadcn/ui Select の代わりに styled native select を使用 */}
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      >
                        {CONTRACT_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>
                      {CONTRACT_TYPE_OPTIONS.find((o) => o.value === watchedType)?.description}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 甲・乙の名称 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="partyA"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        甲（{PARTY_LABELS[watchedType]?.a.split('（')[0]}）
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={partyLabels.a} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="partyB"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        乙（{PARTY_LABELS[watchedType]?.b.split('（')[0]}）
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={partyLabels.b} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* 契約期間・報酬 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>契約期間</FormLabel>
                      <FormControl>
                        <Input placeholder="例: 2025年4月1日〜2026年3月31日" {...field} />
                      </FormControl>
                      <FormDescription>省略可</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {watchedType === 'nda' ? '対価（ある場合）' : '報酬・金額'}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            watchedType === 'nda' ? '例: 無償' : '例: 月額300,000円（税別）'
                          }
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>省略可</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* 主要条件・備考 */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      主要条件・業務内容 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={
                          watchedType === 'service'
                            ? '例: Webアプリケーションの開発業務。フロントエンドの設計・実装・テストを担当。成果物の著作権は甲に帰属する。'
                            : watchedType === 'nda'
                              ? '例: 新製品の開発プロジェクトに関する技術情報・営業情報の相互開示。秘密保持期間は契約終了後3年間。'
                              : '例: 業務用ノートPC 10台（型番: XXX-YYYY）の売買。引渡し場所は乙の指定住所。'
                        }
                        className="min-h-[120px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      業務内容・取引物・権利帰属・特記事項など、契約に含めたい条件を具体的に記載してください。
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* エラーメッセージ */}
              {errorMessage && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 送信ボタン */}
              <Button type="submit" disabled={isGenerating} className="w-full sm:w-auto">
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中...（10〜30秒かかります）
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    契約書を生成する
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* 生成結果エリア */}
      {generatedHtml && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">生成された契約書</CardTitle>
                <CardDescription className="mt-1">
                  内容をご確認ください。法的効力には専門家のレビューをお勧めします。
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="shrink-0"
              >
                <Download className="mr-2 h-4 w-4" />
                HTML でダウンロード
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Claude が生成した HTML をレンダリング */}
            {/* XSS リスク: Claude 生成コンテンツのため自社パイプライン内では安全 */}
            <div
              className={[
                'contract-preview',
                'prose prose-sm max-w-none',
                'rounded-md border bg-white px-8 py-6',
                '[&_h1]:text-center [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-6 [&_h1]:pb-2 [&_h1]:border-b-2 [&_h1]:border-foreground',
                '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2',
                '[&_p]:leading-relaxed [&_p]:my-2',
                '[&_ol]:pl-6 [&_li]:my-1',
                '[&_table]:w-full [&_table]:border-collapse [&_table]:mt-8',
                '[&_td]:border [&_td]:border-gray-300 [&_td]:p-3',
              ].join(' ')}
              dangerouslySetInnerHTML={{ __html: generatedHtml }}
            />

            {/* 残り回数 */}
            {remainingUses !== null && remainingUses !== undefined && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                今月の残り生成回数: <strong>{remainingUses} 回</strong>
                {remainingUses === 0 && (
                  <span className="ml-2">
                    ／{' '}
                    <a href="/upgrade" className="text-primary underline underline-offset-2">
                      プレミアムプランで無制限に
                    </a>
                  </span>
                )}
              </p>
            )}

            {/* 免責事項 */}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              ⚠️ 本ツールが生成した契約書は参考資料です。法的効力の保証はありません。
              実際の契約締結前には必ず弁護士等の専門家にご相談ください。
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
