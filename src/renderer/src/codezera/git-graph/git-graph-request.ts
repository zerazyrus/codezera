import type { GitGraphAction } from '../../../../shared/codezera/git-graph-types'

/** What a menu asks the view to do: run now, confirm first, or collect a branch name. */
export type GitGraphRequest =
  | { kind: 'run'; action: GitGraphAction; label: string }
  | {
      kind: 'confirm'
      action: GitGraphAction
      title: string
      description: string
      destructive?: boolean
    }
  | { kind: 'createBranch'; startPoint: string }
