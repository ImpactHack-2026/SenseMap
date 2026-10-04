export function Logo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M8 19c2.5-4 5.5-4 8 0s5.5 4 8 0"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="stroke-primary-foreground"
      />
      <path
        d="M8 13c2.5-2.4 5.5-2.4 8 0s5.5 2.4 8 0"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="stroke-primary-foreground/50"
      />
    </svg>
  )
}
