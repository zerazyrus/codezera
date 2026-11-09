import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import { useAppStore } from '@/store'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { EditorCommandOwnerContext } from '@/components/editor/editor-command-owner-context'
import { usePdfViewerFindShortcut as useEditorFindShortcut } from '@/components/editor/use-pdf-viewer-find-shortcut'
import type { GitHistoryItem } from '../../../../shared/git/history/git-history-types'
import { createGitGraphFindMatcher, type GitGraphFindOptions } from './git-graph-find'
import type { GitGraphFindBarProps } from './git-graph-find-bar'

export type GitGraphFind = {
  rootRef: RefObject<HTMLDivElement | null>
  shortcutLabel: string | null
  open: () => void
  matchFor: (id: string) => 'match' | 'current' | undefined
  bar: GitGraphFindBarProps | null
}

/** Find over loaded commits, owned by the Git Graph tab: editor Find shortcut, highlight, stepping. */
export function useGitGraphFind(
  items: readonly GitHistoryItem[],
  scrollRef: RefObject<HTMLDivElement | null>
): GitGraphFind {
  const rootRef = useRef<HTMLDivElement>(null)
  const keybindings = useAppStore((s) => s.keybindings)
  const ownsCommands = useContext(EditorCommandOwnerContext)
  const shortcutLabel = useShortcutLabel('editor.find')
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<GitGraphFindOptions>({
    caseSensitive: false,
    regex: false
  })
  const [index, setIndex] = useState(0)
  // Bumped on every Find so a repeat shortcut refocuses and selects the query.
  const [focusToken, setFocusToken] = useState(0)
  const open = useCallback(() => {
    setIsOpen(true)
    setFocusToken((token) => token + 1)
  }, [])
  useEditorFindShortcut({ rootRef, ownsCommands, keybindings, openFind: open })

  const matcher = useMemo(
    () => (isOpen ? createGitGraphFindMatcher(query, options) : null),
    [isOpen, query, options]
  )
  const matches = useMemo(
    () => (typeof matcher === 'function' ? items.filter(matcher).map((item) => item.id) : []),
    [items, matcher]
  )
  const matchedIds = useMemo(() => new Set(matches), [matches])
  const currentIndex = matches.length > 0 ? Math.min(index, matches.length - 1) : 0
  const currentId = matches[currentIndex] ?? null

  useEffect(() => {
    if (currentId) {
      scrollRef.current
        ?.querySelector(`[data-commit-id="${currentId}"]`)
        ?.scrollIntoView({ block: 'center' })
    }
  }, [currentId, scrollRef])

  const step = (delta: number): void => {
    if (matches.length > 0) {
      setIndex((currentIndex + delta + matches.length) % matches.length)
    }
  }

  return {
    rootRef,
    shortcutLabel,
    open,
    matchFor: (id) => (id === currentId ? 'current' : matchedIds.has(id) ? 'match' : undefined),
    bar: isOpen
      ? {
          focusToken,
          query,
          options,
          matchCount: matches.length,
          currentIndex,
          invalid: matcher === 'invalid',
          onQueryChange: (next) => {
            setQuery(next)
            setIndex(0)
          },
          onOptionsChange: (next) => {
            setOptions(next)
            setIndex(0)
          },
          onNext: () => step(1),
          onPrevious: () => step(-1),
          onClose: () => {
            setIsOpen(false)
            rootRef.current?.focus()
          }
        }
      : null
  }
}
