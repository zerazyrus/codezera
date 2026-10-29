import { create } from 'zustand'

export const GIT_GRAPH_MIN_HEIGHT_RATIO = 0.2
/** Opening a diff from the graph shrinks a taller dock to this, so the diff tab is visible above it. */
export const GIT_GRAPH_SPLIT_HEIGHT_RATIO = 0.5

type GitGraphDockState = {
  open: boolean
  /** Share of the workbench column the dock takes; 1 hides the workbench. */
  heightRatio: number
  showRemoteBranches: boolean
  /** Full ref names; null shows every branch. */
  selectedRefs: string[] | null
  setOpen: (open: boolean) => void
  setHeightRatio: (ratio: number) => void
  setShowRemoteBranches: (show: boolean) => void
  setSelectedRefs: (refs: string[] | null) => void
}

export const useGitGraphDock = create<GitGraphDockState>()((set) => ({
  open: false,
  heightRatio: 1,
  showRemoteBranches: true,
  selectedRefs: null,
  setOpen: (open) => set({ open }),
  setHeightRatio: (ratio) =>
    set({ heightRatio: Math.min(1, Math.max(GIT_GRAPH_MIN_HEIGHT_RATIO, ratio)) }),
  setShowRemoteBranches: (showRemoteBranches) => set({ showRemoteBranches }),
  setSelectedRefs: (selectedRefs) => set({ selectedRefs })
}))
