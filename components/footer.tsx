import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">
        <div className="flex flex-wrap justify-between gap-6">
          {/* 運営者情報 */}
          <div>
            <p className="font-semibold text-foreground">法律書類ジェネレーター</p>
            <p className="mt-1">運営者情報: 個人運営</p>
          </div>

          {/* リンク */}
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              プライバシーポリシー
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              利用規約
            </Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">
              お問い合わせ
            </Link>
          </nav>
        </div>

        <p className="mt-6 text-center text-xs">
          © 2026 法律書類ジェネレーター
        </p>
      </div>
    </footer>
  )
}
