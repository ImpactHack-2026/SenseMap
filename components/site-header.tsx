import Link from 'next/link'
import { Logo } from './logo'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4">
          <Logo />
          <span className="font-serif text-xl font-medium tracking-tight">SenseMap</span>
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center gap-1 text-sm">
            <li>
              <Link href="/explore" className="rounded-md px-3 py-2 text-foreground/80 hover:bg-muted hover:text-foreground">
                Explore
              </Link>
            </li>
            <li>
              <Link href="/about" className="rounded-md px-3 py-2 text-foreground/80 hover:bg-muted hover:text-foreground">
                How it works
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
