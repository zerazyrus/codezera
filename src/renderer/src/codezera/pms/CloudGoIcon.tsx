export function CloudGoIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 267 247" aria-hidden className={className} fill="currentColor">
      {/* CloudGO mark as a monochrome provider glyph, like the Jira/Linear ones. */}
      <path
        d="M191.5 65.4A93.5 93.5 0 1 0 97.8 218.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="48"
      />
      <circle cx="123" cy="125" r="31" />
      <path d="M168 117.5 255 70.5c6-3.2 12 .5 12 7.3v94.4c0 6.8-6 10.5-12 7.3l-87-47c-6-3.2-6-11.8 0-15z" />
      <path d="M26 192C80 250 175 252 224 160C168 212 92 222 26 192z" />
    </svg>
  )
}
