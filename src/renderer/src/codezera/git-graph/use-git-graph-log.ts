import { useCallback, useEffect, useRef, useState } from 'react'
import { getConnectionId } from '@/lib/connection-context'
import {
  GIT_GRAPH_PAGE_SIZE,
  type GitGraphLogOptions,
  type GitGraphLogResult
} from '../../../../shared/codezera/git-graph-types'

export type GitGraphLogState =
  | { status: 'loading'; result?: GitGraphLogResult }
  | { status: 'ready'; result: GitGraphLogResult }
  | { status: 'error'; error: string; result?: GitGraphLogResult }

/** Loads the graph for one worktree; waits for repo options, and drops superseded responses by sequence number. */
export function useGitGraphLog({
  worktreeId,
  worktreePath,
  selectedRefs,
  showRemoteBranches,
  options
}: {
  worktreeId: string
  worktreePath: string
  selectedRefs: string[] | null
  showRemoteBranches: boolean
  options: GitGraphLogOptions | null
}): {
  state: GitGraphLogState
  refresh: (options?: { wakeWslDistro?: boolean }) => Promise<void>
  loadMore: () => void
} {
  const [state, setState] = useState<GitGraphLogState>({ status: 'loading' })
  const [limit, setLimit] = useState(GIT_GRAPH_PAGE_SIZE)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    setLimit(GIT_GRAPH_PAGE_SIZE)
    setState({ status: 'loading' })
  }, [worktreeId])

  const refresh = useCallback(
    async (refreshOptions?: { wakeWslDistro?: boolean }): Promise<void> => {
      if (!options) {
        return
      }
      const requestId = ++requestSeqRef.current
      setState((previous) => ({ status: 'loading', result: previous.result }))
      try {
        const result = await window.api.codezera.gitGraph.log({
          worktreePath,
          connectionId: getConnectionId(worktreeId) ?? undefined,
          refs: selectedRefs,
          showRemoteBranches,
          limit,
          options,
          ...(refreshOptions?.wakeWslDistro ? { wakeWslDistro: true } : {})
        })
        if (requestSeqRef.current === requestId) {
          setState({ status: 'ready', result })
        }
      } catch (error) {
        if (requestSeqRef.current === requestId) {
          const message = error instanceof Error ? error.message : String(error)
          setState((previous) => ({ status: 'error', error: message, result: previous.result }))
        }
      }
    },
    [limit, options, selectedRefs, showRemoteBranches, worktreeId, worktreePath]
  )

  useEffect(() => {
    void refresh({ wakeWslDistro: true })
  }, [refresh])

  const loadMore = useCallback(() => setLimit((current) => current + GIT_GRAPH_PAGE_SIZE), [])

  return { state, refresh, loadMore }
}
