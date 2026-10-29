import type React from 'react'
import { useMemo } from 'react'
import type { GitGraphIssueLinking } from '../../../../shared/codezera/git-graph-types'

type Segment = { start: number; text: string; url?: string }

/** Splits `text` on issue matches; a bad regex or a non-http URL leaves the text plain. */
export function splitIssueLinks(text: string, linking: GitGraphIssueLinking | null): Segment[] {
  if (!linking) {
    return [{ start: 0, text }]
  }
  let regex: RegExp
  try {
    regex = new RegExp(linking.issueRegex, 'g')
  } catch {
    return [{ start: 0, text }]
  }
  const segments: Segment[] = []
  let last = 0
  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0
    if (match[0].length === 0) {
      continue
    }
    const url = linking.issueUrl.replace(/\$(\d)/g, (_, group: string) =>
      encodeURIComponent(match[Number(group)] ?? '')
    )
    if (!/^https?:\/\//i.test(url)) {
      continue
    }
    if (start > last) {
      segments.push({ start: last, text: text.slice(last, start) })
    }
    segments.push({ start, text: match[0], url })
    last = start + match[0].length
  }
  if (last < text.length) {
    segments.push({ start: last, text: text.slice(last) })
  }
  return segments
}

export function GitGraphIssueText({
  text,
  linking
}: {
  text: string
  linking: GitGraphIssueLinking | null
}): React.JSX.Element {
  const segments = useMemo(() => splitIssueLinks(text, linking), [linking, text])
  return (
    <>
      {segments.map((segment) =>
        segment.url ? (
          <a
            key={segment.start}
            href={segment.url}
            className="text-sky-400 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void window.api.shell.openUrl(segment.url!)
            }}
          >
            {segment.text}
          </a>
        ) : (
          <span key={segment.start}>{segment.text}</span>
        )
      )}
    </>
  )
}
