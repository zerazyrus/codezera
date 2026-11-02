function datePart(now: Date, name: string): string | null {
  const pad = (value: number): string => String(value).padStart(2, '0')
  switch (name) {
    case 'CURRENT_YEAR':
      return String(now.getFullYear())
    case 'CURRENT_YEAR_SHORT':
      return String(now.getFullYear()).slice(-2)
    case 'CURRENT_MONTH':
      return pad(now.getMonth() + 1)
    case 'CURRENT_DATE':
      return pad(now.getDate())
    case 'CURRENT_HOUR':
      return pad(now.getHours())
    case 'CURRENT_MINUTE':
      return pad(now.getMinutes())
    case 'CURRENT_SECOND':
      return pad(now.getSeconds())
    default:
      return null
  }
}

/**
 * Approximates what inserting the snippet types: placeholders show their default text, choices
 * their first option, date variables today's value; other variables stay as `NAME`.
 */
export function previewSnippetBody(body: string, now: Date = new Date()): string {
  let text = body
  // Innermost-first, so nested placeholders like `${1:a ${2:b}}` resolve fully.
  for (let previous = ''; previous !== text;) {
    previous = text
    text = text
      .replace(/\$\{\d+:([^${}]*)\}/g, '$1')
      .replace(/\$\{\d+\|([^,|}]*)[^}]*\|\}/g, '$1')
      .replace(
        /\$\{([A-Z_]+):([^${}]*)\}/g,
        (_match, name: string, fallback: string) => datePart(now, name) ?? fallback
      )
  }
  return text
    .replace(/\$\{?\d+\}?/g, '')
    .replace(/\$\{?([A-Z_]+)\}?/g, (_match, name: string) => datePart(now, name) ?? name)
    .replace(/\\([$}\\])/g, '$1')
}
