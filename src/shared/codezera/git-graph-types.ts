import type { GitHistoryItem } from '../git-history'

export const GIT_GRAPH_PAGE_SIZE = 300
export const GIT_GRAPH_MAX_LIMIT = 5000

export type GitGraphBranch = {
  /** Short name as shown, e.g. `main` or `origin/main`. */
  name: string
  /** Full ref, e.g. `refs/heads/main`; the only form accepted back as a filter. */
  fullName: string
  remote: boolean
}

export type GitGraphLogRequest = {
  worktreePath: string
  connectionId?: string
  wakeWslDistro?: boolean
  /** Full ref names to show; null shows every local branch, tag and HEAD. */
  refs: string[] | null
  showRemoteBranches: boolean
  limit: number
}

export type GitGraphLogResult = {
  items: GitHistoryItem[]
  hasMore: boolean
  limit: number
  headOid: string | null
  currentBranch: string | null
  branches: GitGraphBranch[]
  uncommittedCount: number
}

export type GitGraphAction =
  | { kind: 'checkout'; ref: string }
  | { kind: 'checkoutRemoteBranch'; remoteBranch: string; localName: string }
  | { kind: 'createBranch'; name: string; startPoint: string; checkout: boolean }
  | { kind: 'deleteBranch'; name: string; force: boolean }
  | { kind: 'merge'; ref: string }
  /** `mainline` picks the parent side for merge commits (git -m). */
  | { kind: 'cherryPick'; commit: string; mainline?: number }
  | { kind: 'revert'; commit: string; mainline?: number }
  | { kind: 'reset'; commit: string; mode: 'soft' | 'mixed' | 'hard' }
  | { kind: 'fetch' }

export type GitGraphActionRequest = {
  worktreePath: string
  connectionId?: string
  action: GitGraphAction
}

export type GitGraphApi = {
  log: (args: GitGraphLogRequest) => Promise<GitGraphLogResult>
  runAction: (args: GitGraphActionRequest) => Promise<{ output: string }>
}
