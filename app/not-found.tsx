import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="font-serif text-3xl font-medium tracking-tight">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-muted-foreground">The restaurant may have moved or the link may be out of date.</p>
      <Link href="/explore" className={cn(buttonVariants({ size: 'lg' }), 'mt-6 h-11 rounded-xl px-5')}>
        Back to Explore
      </Link>
    </div>
  )
}
