import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-start md:justify-between">
        <p className="max-w-xl text-pretty leading-relaxed">
          SenseMap estimates are generated from public reviews and may not reflect every visit. Sensory conditions
          can change by day, time, and event. Ratings and place details are provided by Google when connected.
        </p>
        <nav aria-label="Footer">
          <ul className="flex gap-4">
            <li>
              <Link href="/explore" className="hover:text-foreground">
                Explore
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-foreground">
                How it works
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
