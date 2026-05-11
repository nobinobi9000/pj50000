// お問い合わせページ
// AdSense 審査必須ページ

import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, ExternalLink } from 'lucide-react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pj50000.vercel.app'
const SITE_NAME = '法律書類ジェネレーター'

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: `${SITE_NAME}へのお問い合わせページです。ご質問・ご意見・不具合報告などはこちらからどうぞ。`,
  alternates: {
    canonical: `${APP_URL}/contact`,
  },
  openGraph: {
    title: `お問い合わせ | ${SITE_NAME}`,
    description: `${SITE_NAME}へのお問い合わせページです。`,
    url: `${APP_URL}/contact`,
    siteName: SITE_NAME,
    type: 'website',
  },
}

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-3 text-3xl font-bold tracking-tight">お問い合わせ</h1>
      <p className="mb-10 text-muted-foreground">
        ご質問・ご意見・不具合報告など、お気軽にご連絡ください。
      </p>

      {/* Googleフォーム */}
      <div className="mb-8 rounded-lg border bg-card p-8 shadow-sm text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-7 w-7 text-primary" />
          </div>
        </div>
        <h2 className="mb-2 text-xl font-semibold">お問い合わせフォーム</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          以下のボタンからGoogleフォームにアクセスしてください。<br />
          通常2〜3営業日以内にご返信します。
        </p>
        <a
          href="https://forms.gle/example"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow transition-opacity hover:opacity-90"
        >
          <ExternalLink className="h-4 w-4" />
          お問い合わせフォームを開く
        </a>
      </div>

      {/* メールアドレス */}
      <div className="rounded-lg border bg-muted/40 p-6">
        <h2 className="mb-2 text-base font-semibold">メールでのお問い合わせ</h2>
        <p className="text-sm text-muted-foreground">
          フォームをご利用いただけない場合は、以下のメールアドレスまでご連絡ください。
        </p>
        <p className="mt-2 font-mono text-sm">
          info@pj50000.example.com
        </p>
      </div>

      {/* 注意事項 */}
      <div className="mt-8 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">お問い合わせに関するご注意</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>法律相談・弁護士紹介には対応しておりません。</li>
          <li>AIが生成した書類の内容に関する法的アドバイスは行っておりません。</li>
          <li>いただいたお問い合わせ内容は、サービス改善のために参考にさせていただく場合があります。</li>
        </ul>
        <p className="mt-4">
          プライバシーポリシーについては<Link href="/privacy" className="text-primary underline underline-offset-2">こちら</Link>をご確認ください。
        </p>
      </div>
    </div>
  )
}
