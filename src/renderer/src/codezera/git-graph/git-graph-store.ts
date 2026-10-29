import { useEffect } from 'react'
import { create } from 'zustand'
import type { GitGraphRepoSettings } from '../../../../shared/codezera/git-graph-types'

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
  settingsByRepo: Record<string, GitGraphRepoSettings>
  setShowRemoteBranches: (show: boolean) => void
  patchView: (worktreeId: string, patch: Partial<GitGraphViewState>) => void
  loadRepoSettings: (repoId: string) => Promise<void>
  saveRepoSettings: (repoId: string, settings: GitGraphRepoSettings) => Promise<void>
}

export const useGitGraphStore = create<GitGraphStore>()((set, get) => ({
  showRemoteBranches: true,
  viewByWorktree: {},
  settingsByRepo: {},
  setShowRemoteBranches: (showRemoteBranches) => set({ showRemoteBranches }),
  patchView: (worktreeId, patch) =>
    set((s) => ({
      viewByWorktree: {
        ...s.viewByWorktree,
        [worktreeId]: { ...(s.viewByWorktree[worktreeId] ?? EMPTY_VIEW), ...patch }
      }
    })),
  loadRepoSettings: async (repoId) => {
    if (get().settingsByRepo[repoId]) {
      return
    }
    const settings = await window.api.codezera.gitGraph.getSettings(repoId)
    set((s) => ({ settingsByRepo: { ...s.settingsByRepo, [repoId]: settings } }))
  },
  saveRepoSettings: async (repoId, settings) => {
    await window.api.codezera.gitGraph.setSettings(repoId, settings)
    set((s) => ({ settingsByRepo: { ...s.settingsByRepo, [repoId]: settings } }))
  }
}))

export function useGitGraphViewState(worktreeId: string): GitGraphViewState {
  return useGitGraphStore((s) => s.viewByWorktree[worktreeId] ?? EMPTY_VIEW)
}

/** Null until this repo's settings arrive; a newly seen worktree then starts on the initial branches. */
export function useGitGraphRepoSettings(
  repoId: string,
  worktreeId: string
): GitGraphRepoSettings | null {
  const settings = useGitGraphStore((s) => s.settingsByRepo[repoId] ?? null)
  useEffect(() => {
    void useGitGraphStore.getState().loadRepoSettings(repoId)
  }, [repoId])
  useEffect(() => {
    const store = useGitGraphStore.getState()
    if (settings && !store.viewByWorktree[worktreeId]) {
      store.patchView(worktreeId, { selectedRefs: settings.initialBranches })
    }
  }, [settings, worktreeId])
  return settings
}
