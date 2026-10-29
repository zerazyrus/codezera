import { create } from 'zustand'

/** What a Git Graph tab shows; kept outside the tab so switching tabs does not lose it. */
export type GitGraphViewState = {
  /** Full ref names; null shows every branch. */
  selectedRefs: string[] | null
  expandedId: string | null
}

const EMPTY_VIEW: GitGraphViewState = { selectedRefs: null, expandedId: null }

type GitGraphStore = {
  showRemoteBranches: boolean
  viewByWorktree: Record<string, GitGraphViewState>
  setShowRemoteBranches: (show: boolean) => void
  patchView: (worktreeId: string, patch: Partial<GitGraphViewState>) => void
}

export const useGitGraphStore = create<GitGraphStore>()((set) => ({
  showRemoteBranches: true,
  viewByWorktree: {},
  setShowRemoteBranches: (showRemoteBranches) => set({ showRemoteBranches }),
  patchView: (worktreeId, patch) =>
    set((s) => ({
      viewByWorktree: {
        ...s.viewByWorktree,
        [worktreeId]: { ...(s.viewByWorktree[worktreeId] ?? EMPTY_VIEW), ...patch }
      }
    }))
}))

export function useGitGraphViewState(worktreeId: string): GitGraphViewState {
  return useGitGraphStore((s) => s.viewByWorktree[worktreeId] ?? EMPTY_VIEW)
}
