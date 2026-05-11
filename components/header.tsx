import Link from 'next/link'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
        {/* サイト名 */}
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-foreground hover:text-primary transition-colors"
        >
          法律書類ジェネレーター
        </Link>

        {/* ナビゲーション */}
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <Link
            href="/articles"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            記事一覧
          </Link>
          <Link
            href="/tools/contract-generator"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            契約書を作る
          </Link>
          <Link
            href="/privacy"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            プライバシーポリシー
          </Link>
          <Link
            href="/contact"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            お問い合わせ
          </Link>
        </nav>
      </div>
    </header>
  )
}
