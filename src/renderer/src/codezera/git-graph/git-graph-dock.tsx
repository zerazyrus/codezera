import type React from 'react'
import { useRef } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { useWorktreeGitOwnerTarget } from '@/components/right-sidebar/worktree-git-owner-target'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { useGitGraphDock } from './git-graph-dock-store'
import { GitGraphView } from './git-graph-view'

function DockMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** Bottom dock below the workbench; the workbench keeps its tabs, so diffs opened from the graph stay visible above it. */
export function GitGraphDock(): React.JSX.Element | null {
  const open = useGitGraphDock((s) => s.open)
  const heightRatio = useGitGraphDock((s) => s.heightRatio)
  const activeView = useAppStore((s) => s.activeView)
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const repoTarget = useWorktreeGitOwnerTarget(activeWorktree?.id)
  const dockRef = useRef<HTMLDivElement>(null)

  if (!open || activeView !== 'terminal' || !activeWorktree) {
    return null
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const column = dockRef.current?.parentElement
    if (!column) {
      return
    }
    event.preventDefault()
    const bounds = column.getBoundingClientRect()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const onMove = (move: PointerEvent): void => {
      useGitGraphDock.getState().setHeightRatio((bounds.bottom - move.clientY) / bounds.height)
    }
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }

  let body: React.ReactNode
  if (activeRepo && isFolderRepo(activeRepo)) {
    body = (
      <DockMessage>
        {translate('codezera.gitGraph.folder', 'This workspace is a folder, not a git repository.')}
      </DockMessage>
    )
  } else if (repoTarget?.kind !== 'local') {
    body = (
      <DockMessage>
        {translate(
          'codezera.gitGraph.remoteUnsupported',
          'Git Graph supports local workspaces only for now.'
        )}
      </DockMessage>
    )
  } else {
    body = (
      <GitGraphView
        worktreeId={activeWorktree.id}
        worktreePath={activeWorktree.path}
        repoTarget={repoTarget}
      />
    )
  }

  return (
    <div
      ref={dockRef}
      className="relative flex min-h-0 shrink-0 flex-col border-t border-border"
      style={{ height: `${heightRatio * 100}%` }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={translate('codezera.gitGraph.resize', 'Resize Git Graph')}
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize hover:bg-ring/30"
        onPointerDown={startResize}
      />
      {body}
    </div>
  )
}
