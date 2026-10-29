import type React from 'react'
import { translate } from '@/i18n/i18n'
import { useRepoById, useWorktreeById } from '@/store/selectors'
import { useWorktreeGitOwnerTarget } from '@/components/right-sidebar/worktree-git-owner-target'
import type { OpenFile } from '@/store/slices/editor'
import { isFolderRepo } from '../../../shared/repo-kind'
import { GitGraphView } from './git-graph/git-graph-view'

function PanelMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** Body of a `codezera-panel` editor tab. */
export function CodezeraPanelContent({ file }: { file: OpenFile }): React.JSX.Element {
  const worktree = useWorktreeById(file.worktreeId)
  const repo = useRepoById(worktree?.repoId ?? null)
  const repoTarget = useWorktreeGitOwnerTarget(file.worktreeId)

  if (!worktree) {
    return (
      <PanelMessage>{translate('codezera.panel.noWorktree', 'Workspace not found.')}</PanelMessage>
    )
  }
  if (repo && isFolderRepo(repo)) {
    return (
      <PanelMessage>
        {translate('codezera.gitGraph.folder', 'This workspace is a folder, not a git repository.')}
      </PanelMessage>
    )
  }
  if (repoTarget?.kind !== 'local') {
    return (
      <PanelMessage>
        {translate(
          'codezera.gitGraph.remoteUnsupported',
          'Git Graph supports local workspaces only for now.'
        )}
      </PanelMessage>
    )
  }
  return (
    <GitGraphView
      worktreeId={worktree.id}
      worktreePath={worktree.path}
      repoId={worktree.repoId}
      repoName={repo?.displayName ?? worktree.path}
      repoTarget={repoTarget}
    />
  )
}
