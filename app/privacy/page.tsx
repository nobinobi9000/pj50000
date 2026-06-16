// プライバシーポリシーページ
// AdSense 審査必須ページ

import type { Metadata } from 'next'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://legal.nobi-labo.com'
const SITE_NAME = '法律書類ジェネレーター'

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: `${SITE_NAME}のプライバシーポリシー。個人情報の取り扱い、Cookie、Google AdSense・Analyticsの利用について説明します。`,
  alternates: {
    canonical: `${APP_URL}/privacy`,
  },
  openGraph: {
    title: `プライバシーポリシー | ${SITE_NAME}`,
    description: `${SITE_NAME}のプライバシーポリシー。`,
    url: `${APP_URL}/privacy`,
    siteName: SITE_NAME,
    type: 'website',
  },
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">プライバシーポリシー</h1>
      <p className="mb-10 text-sm text-muted-foreground">最終更新日: 2026年5月11日</p>

      <div className="prose prose-sm max-w-none text-foreground [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1">

        <p>
          法律書類ジェネレーター（以下「当サイト」）は、ユーザーの個人情報の保護を重要な責務と考えております。
          本プライバシーポリシーでは、当サイトにおける個人情報の取り扱いについて説明します。
        </p>

        <h2>1. 運営者情報</h2>
        <p>
          当サイトは個人が運営しています。お問い合わせは<a href="/contact" className="text-primary underline underline-offset-2">お問い合わせページ</a>からお願いします。
        </p>

        <h2>2. 収集する情報</h2>
        <p>当サイトでは、以下の情報を収集することがあります。</p>
        <ul>
          <li>お問い合わせフォームに入力された情報（氏名、メールアドレス、メッセージ内容）</li>
          <li>アクセスログ（IPアドレス、ブラウザの種類、参照元URL、アクセス日時）</li>
          <li>Cookieおよびこれに類する技術によって収集される情報</li>
          <li>AIによる書類生成に入力された情報（サーバーに保存する場合）</li>
        </ul>

        <h2>3. 情報の利用目的</h2>
        <p>収集した情報は、以下の目的のために使用します。</p>
        <ul>
          <li>サービスの提供・改善</li>
          <li>お問い合わせへの回答</li>
          <li>サイトのアクセス状況の把握・分析</li>
          <li>不正アクセスの防止</li>
          <li>法令に基づく対応</li>
        </ul>

        <h2>4. Cookieについて</h2>
        <p>
          当サイトはCookieを使用しています。Cookieとは、ウェブサイトからブラウザに送信される小さなデータファイルです。
          ブラウザの設定によりCookieを無効にすることができますが、その場合、サービスの一部が正常に機能しない場合があります。
        </p>

        <h2>5. Google AdSenseについて</h2>
        <p>
          当サイトはGoogle AdSense（グーグル・アドセンス）を利用しています。
          Google AdSenseは、広告配信のためにCookieを使用し、ユーザーが当サイトや他のサイトに過去にアクセスした際の情報に基づいて広告を配信します。
        </p>
        <p>
          Googleによる広告Cookieの使用はオプトアウトページ（<a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">https://www.google.com/settings/ads</a>）またはNetwork Advertising Initiative（<a href="https://www.networkadvertising.org/managing/opt_out.asp" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">https://www.networkadvertising.org/managing/opt_out.asp</a>）で無効にすることができます。
        </p>

        <h2>6. Google Analyticsについて</h2>
        <p>
          当サイトはGoogleが提供するアクセス解析ツール「Google Analytics」を利用しています。
          Google Analyticsはトラフィックデータの収集のためにCookieを使用します。
          このトラフィックデータは匿名で収集されており、個人を特定するものではありません。
        </p>
        <p>
          Google Analyticsの利用規約については<a href="https://www.google.com/analytics/terms/jp.html" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">こちら</a>をご確認ください。
          Google Analyticsによるデータ収集はブラウザのアドオン（<a href="https://tools.google.com/dlpage/gaoptout?hl=ja" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Google Analyticsオプトアウトアドオン</a>）で無効にすることができます。
        </p>

        <h2>7. 第三者への情報提供</h2>
        <p>当サイトは、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。</p>
        <ul>
          <li>ユーザー本人の同意がある場合</li>
          <li>法令に基づく開示が必要な場合</li>
          <li>人の生命・身体・財産の保護のために必要な場合</li>
        </ul>

        <h2>8. 個人情報の安全管理</h2>
        <p>
          当サイトは、収集した個人情報の漏洩・滅失・毀損を防ぐため、適切なセキュリティ対策を講じます。
          ただし、インターネット上の通信は完全に安全とは言えないため、完全な安全性を保証することはできません。
        </p>

        <h2>9. 未成年者の個人情報</h2>
        <p>
          当サイトは、18歳未満の方が個人情報を送信する際は、保護者の同意を得た上でご利用ください。
        </p>

        <h2>10. 免責事項</h2>
        <p>
          当サイトのリンク先の外部サイトにおける情報の取り扱いについては、当サイトは責任を負いません。
          各外部サイトのプライバシーポリシーをご確認ください。
        </p>

        <h2>11. プライバシーポリシーの変更</h2>
        <p>
          当サイトは、必要に応じて本プライバシーポリシーを変更することがあります。
          変更後のプライバシーポリシーは、当ページに掲載した時点から効力を生じるものとします。
        </p>

        <h2>12. お問い合わせ</h2>
        <p>
          本プライバシーポリシーに関するお問い合わせは、<a href="/contact" className="text-primary underline underline-offset-2">お問い合わせページ</a>からご連絡ください。
        </p>
      </div>
    </div>
  )
}
