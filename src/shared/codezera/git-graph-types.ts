import type { GitHistoryItem } from '../git-history'

export const GIT_GRAPH_PAGE_SIZE = 300
export const GIT_GRAPH_MAX_LIMIT = 5000

/** Stash rows carry a ref with this id prefix, e.g. `refs/stash@{0}`. */
export const GIT_GRAPH_STASH_REF_PREFIX = 'refs/stash@'

export type GitGraphBranch = {
  /** Short name as shown, e.g. `main` or `origin/main`. */
  name: string
  /** Full ref, e.g. `refs/heads/main`; the only form accepted back as a filter. */
  fullName: string
  remote: boolean
}

export type GitGraphIssueLinking = {
  /** JavaScript regex matched against commit messages, e.g. `#(\d+)`. */
  issueRegex: string
  /** Target URL; `$1`…`$9` take the regex groups. */
  issueUrl: string
}

/** Per-repository Git Graph settings, like VS Code Git Graph's Repository Settings. */
export type GitGraphRepoSettings = {
  /** Branch filter a newly opened graph starts with; null shows all. */
  initialBranches: string[] | null
  showStashes: boolean
  showTags: boolean
  includeReflogs: boolean
  firstParentOnly: boolean
  /** Remotes whose branches are left out of the graph. */
  hiddenRemotes: string[]
  issueLinking: GitGraphIssueLinking | null
}

export const DEFAULT_GIT_GRAPH_REPO_SETTINGS: GitGraphRepoSettings = {
  initialBranches: null,
  showStashes: true,
  showTags: true,
  includeReflogs: false,
  firstParentOnly: false,
  hiddenRemotes: [],
  issueLinking: null
}

export type GitGraphLogOptions = Pick<
  GitGraphRepoSettings,
  'showStashes' | 'showTags' | 'includeReflogs' | 'firstParentOnly' | 'hiddenRemotes'
>

export type GitGraphLogRequest = {
  worktreePath: string
  connectionId?: string
  wakeWslDistro?: boolean
  /** Full ref names to show; null shows every local branch, tag and HEAD. */
  refs: string[] | null
  showRemoteBranches: boolean
  limit: number
  options: GitGraphLogOptions
}

export type GitGraphLogResult = {
  items: GitHistoryItem[]
  hasMore: boolean
  limit: number
  headOid: string | null
  currentBranch: string | null
  branches: GitGraphBranch[]
  uncommittedCount: number
  /** When the graph was read; the Uncommitted Changes row shows it, like VS Code Git Graph. */
  loadedAt: number
}

export type GitGraphConfigScope = 'local' | 'global'

export type GitGraphRemote = {
  name: string
  fetchUrl: string | null
  pushUrl: string | null
}

export type GitGraphRepoInfo = {
  userName: string | null
  userEmail: string | null
  /** Where the effective user.name/user.email come from; local wins over global. */
  userScope: GitGraphConfigScope | null
  remotes: GitGraphRemote[]
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
  | { kind: 'stash'; operation: 'apply' | 'pop' | 'drop'; selector: string }
  | { kind: 'setUser'; name: string; email: string; scope: GitGraphConfigScope }
  | { kind: 'unsetUser'; scope: GitGraphConfigScope }
  | { kind: 'addRemote'; name: string; fetchUrl: string; pushUrl: string | null }
  | { kind: 'editRemote'; name: string; newName: string; fetchUrl: string; pushUrl: string | null }
  | { kind: 'deleteRemote'; name: string }
  | { kind: 'fetchRemote'; name: string; prune: boolean }
  | { kind: 'pruneRemote'; name: string }

export type GitGraphActionRequest = {
  worktreePath: string
  connectionId?: string
  action: GitGraphAction
}

export type GitGraphRepoInfoRequest = {
  worktreePath: string
  connectionId?: string
}

export type GitGraphApi = {
  log: (args: GitGraphLogRequest) => Promise<GitGraphLogResult>
  runAction: (args: GitGraphActionRequest) => Promise<{ output: string }>
  repoInfo: (args: GitGraphRepoInfoRequest) => Promise<GitGraphRepoInfo>
  getSettings: (repoId: string) => Promise<GitGraphRepoSettings>
  setSettings: (repoId: string, settings: GitGraphRepoSettings) => Promise<void>
}
