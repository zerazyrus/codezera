import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CloudDownload, Loader2, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getConnectionId } from '@/lib/connection-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGitHistoryCommitActions } from '@/components/right-sidebar/source-control/sync/use-git-history-commit-actions'
import {
  GitHistoryCommitFiles,
  type GitHistoryCommitFilesState
} from '@/components/right-sidebar/source-control/sync/git-history-commit-files'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type {
  GitHistoryGraphColorId,
  GitHistoryItem,
  GitHistoryItemRef
} from '../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../shared/git-diff-compare-types'
import { buildGitHistoryViewModels } from '../../../../shared/git-history-graph'
import type { GitGraphAction } from '../../../../shared/codezera/git-graph-types'
import { GIT_GRAPH_GRID_COLUMNS, GitGraphCommitRow } from './git-graph-commit-row'
import { GitGraphBranchPicker } from './git-graph-branch-picker'
import { GitGraphRequestDialog } from './git-graph-request-dialog'
import type { GitGraphRequest } from './git-graph-request'
import { GIT_GRAPH_SPLIT_HEIGHT_RATIO, useGitGraphDock } from './git-graph-dock-store'
import { useGitGraphLog } from './use-git-graph-log'

const SWIMLANE_WIDTH = 11
const MIN_GRAPH_COLUMN_WIDTH = 56
const MAX_GRAPH_COLUMN_WIDTH = 320
const NO_SPLIT_GROUP = (): undefined => undefined

function ToolbarIconButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function GitGraphView({
  worktreeId,
  worktreePath,
  repoTarget
}: {
  worktreeId: string
  worktreePath: string
  repoTarget: RuntimeClientTarget
}): React.JSX.Element {
  const selectedRefs = useGitGraphDock((s) => s.selectedRefs)
  const showRemoteBranches = useGitGraphDock((s) => s.showRemoteBranches)
  const heightRatio = useGitGraphDock((s) => s.heightRatio)
  const { setOpen, setHeightRatio, setSelectedRefs, setShowRemoteBranches } =
    useGitGraphDock.getState()
  const { state, refresh, loadMore } = useGitGraphLog({
    worktreeId,
    worktreePath,
    selectedRefs,
    showRemoteBranches
  })
  const result = state.result
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filesById, setFilesById] = useState<Record<string, GitHistoryCommitFilesState>>({})
  const [request, setRequest] = useState<Exclude<GitGraphRequest, { kind: 'run' }> | null>(null)
  const [fetching, setFetching] = useState(false)
  const { loadCommitFiles, openCommitFile, openHistoryCommitDiff, handleCommitAction } =
    useGitHistoryCommitActions({
      activeWorktreeId: worktreeId,
      worktreePath,
      activeRepoTarget: repoTarget,
      resolveSplitTargetGroupId: NO_SPLIT_GROUP
    })

  useEffect(() => {
    setExpandedId(null)
    setFilesById({})
    setSelectedRefs(null)
  }, [setSelectedRefs, worktreeId])

  // Orca's status poller notices commits, checkouts and edits made elsewhere (terminal, agents).
  const statusHead = useAppStore((s) => s.gitStatusHeadByWorktree[worktreeId])
  const statusEntryCount = useAppStore((s) => s.gitStatusByWorktree[worktreeId]?.length)
  const statusKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${statusHead ?? ''}:${statusEntryCount ?? ''}`
    if (statusKeyRef.current !== null && statusKeyRef.current !== key) {
      void refresh()
    }
    statusKeyRef.current = key
  }, [refresh, statusEntryCount, statusHead])

  const viewModels = useMemo(() => {
    if (!result) {
      return []
    }
    const colorMap = new Map<string, GitHistoryGraphColorId | undefined>()
    for (const item of result.items) {
      for (const ref of item.references ?? []) {
        // Unset entries take the lane color, so each badge matches its line like VS Code Git Graph.
        colorMap.set(ref.id, undefined)
      }
    }
    const currentRef: GitHistoryItemRef | undefined = result.headOid
      ? {
          id: result.currentBranch ? `refs/heads/${result.currentBranch}` : 'HEAD',
          name: result.currentBranch ?? 'HEAD',
          revision: result.headOid
        }
      : undefined
    return buildGitHistoryViewModels(result.items, colorMap, currentRef)
  }, [result])

  const graphColumnWidth = useMemo(() => {
    let lanes = 1
    for (const viewModel of viewModels) {
      lanes = Math.max(lanes, viewModel.inputSwimlanes.length, viewModel.outputSwimlanes.length)
    }
    return Math.min(
      MAX_GRAPH_COLUMN_WIDTH,
      Math.max(MIN_GRAPH_COLUMN_WIDTH, SWIMLANE_WIDTH * (lanes + 1))
    )
  }, [viewModels])

  const toggleCommit = useCallback(
    (item: GitHistoryItem) => {
      setExpandedId((current) => (current === item.id ? null : item.id))
      if (filesById[item.id]?.status === 'ready') {
        return
      }
      setFilesById((prev) => ({ ...prev, [item.id]: { status: 'loading' } }))
      loadCommitFiles(item).then(
        (entries) => setFilesById((prev) => ({ ...prev, [item.id]: { status: 'ready', entries } })),
        (error: unknown) =>
          setFilesById((prev) => ({
            ...prev,
            [item.id]: {
              status: 'error',
              error: error instanceof Error ? error.message : String(error)
            }
          }))
      )
    },
    [filesById, loadCommitFiles]
  )

  const revealWorkbench = useCallback(() => {
    if (useGitGraphDock.getState().heightRatio > GIT_GRAPH_SPLIT_HEIGHT_RATIO) {
      setHeightRatio(GIT_GRAPH_SPLIT_HEIGHT_RATIO)
    }
  }, [setHeightRatio])

  const runAction = useCallback(
    async (action: GitGraphAction): Promise<boolean> => {
      try {
        const { output } = await window.api.codezera.gitGraph.runAction({
          worktreePath,
          connectionId: getConnectionId(worktreeId) ?? undefined,
          action
        })
        toast.success(translate('codezera.gitGraph.action.done', 'Git command finished'), {
          description: output || undefined
        })
        return true
      } catch (error) {
        toast.error(translate('codezera.gitGraph.action.failed', 'Git command failed'), {
          description: error instanceof Error ? error.message : String(error)
        })
        return false
      } finally {
        void refresh()
      }
    },
    [refresh, worktreeId, worktreePath]
  )

  const handleRequest = useCallback(
    (next: GitGraphRequest) => {
      if (next.kind === 'run') {
        void runAction(next.action)
        return
      }
      setRequest(next)
    },
    [runAction]
  )

  const fetchAll = async (): Promise<void> => {
    setFetching(true)
    await runAction({ kind: 'fetch' })
    setFetching(false)
  }

  const openSourceControl = (): void => {
    const store = useAppStore.getState()
    store.setRightSidebarTab('source-control')
    store.setRightSidebarOpen(true)
  }

  const loading = state.status === 'loading'
  const maximized = heightRatio >= 1

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="git-graph-view">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border px-3 text-xs">
        <span className="font-semibold">{translate('codezera.gitGraph.title', 'Git Graph')}</span>
        <span className="text-muted-foreground">
          {translate('codezera.gitGraph.branchesLabel', 'Branches')}
        </span>
        <GitGraphBranchPicker
          branches={result?.branches ?? []}
          selectedRefs={selectedRefs}
          showRemoteBranches={showRemoteBranches}
          onChange={setSelectedRefs}
        />
        <Label className="flex items-center gap-1.5 text-xs font-normal">
          <Checkbox
            checked={showRemoteBranches}
            onCheckedChange={(value) => setShowRemoteBranches(value === true)}
          />
          {translate('codezera.gitGraph.showRemote', 'Show remote branches')}
        </Label>
        <div className="ml-auto flex items-center gap-1">
          {loading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          <ToolbarIconButton
            label={translate('codezera.gitGraph.fetch', 'Fetch from all remotes')}
            disabled={fetching}
            onClick={() => void fetchAll()}
          >
            <CloudDownload className={cn(fetching && 'animate-pulse')} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={translate('codezera.gitGraph.refresh', 'Refresh')}
            onClick={() => void refresh({ wakeWslDistro: true })}
          >
            <RefreshCw />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={
              maximized
                ? translate('codezera.gitGraph.restore', 'Show workbench')
                : translate('codezera.gitGraph.maximize', 'Maximize')
            }
            onClick={() => setHeightRatio(maximized ? GIT_GRAPH_SPLIT_HEIGHT_RATIO : 1)}
          >
            {maximized ? <Minimize2 /> : <Maximize2 />}
          </ToolbarIconButton>
          <ToolbarIconButton
            label={translate('codezera.gitGraph.close', 'Close Git Graph')}
            onClick={() => setOpen(false)}
          >
            <X />
          </ToolbarIconButton>
        </div>
      </div>
      <div
        className="grid h-7 shrink-0 items-center gap-x-3 border-b border-border pr-3 text-[11px] font-semibold text-muted-foreground"
        style={{
          gridTemplateColumns: GIT_GRAPH_GRID_COLUMNS,
          ['--git-graph-lanes' as string]: `${graphColumnWidth}px`
        }}
      >
        <span className="pl-2">{translate('codezera.gitGraph.column.graph', 'Graph')}</span>
        <span>{translate('codezera.gitGraph.column.description', 'Description')}</span>
        <span>{translate('codezera.gitGraph.column.date', 'Date')}</span>
        <span>{translate('codezera.gitGraph.column.author', 'Author')}</span>
        <span>{translate('codezera.gitGraph.column.commit', 'Commit')}</span>
      </div>
      <div
        role="table"
        className="scrollbar-sleek min-h-0 flex-1 overflow-auto"
        style={{ ['--git-graph-lanes' as string]: `${graphColumnWidth}px` }}
      >
        {state.status === 'error' ? (
          <div className="px-3 py-2 text-xs text-destructive">{state.error}</div>
        ) : null}
        {result && result.uncommittedCount > 0 ? (
          <div
            role="row"
            tabIndex={0}
            className="grid h-6 cursor-pointer items-center gap-x-3 pr-3 text-xs hover:bg-accent"
            style={{ gridTemplateColumns: GIT_GRAPH_GRID_COLUMNS }}
            onClick={openSourceControl}
            onKeyDown={(event) => (event.key === 'Enter' ? openSourceControl() : undefined)}
          >
            <svg
              aria-hidden="true"
              width={SWIMLANE_WIDTH * 2}
              height={24}
              className="overflow-visible"
            >
              <line
                x1={SWIMLANE_WIDTH}
                y1={12}
                x2={SWIMLANE_WIDTH}
                y2={24}
                stroke="var(--muted-foreground)"
                strokeDasharray="2 2"
              />
              <circle
                cx={SWIMLANE_WIDTH}
                cy={12}
                r={3.5}
                fill="var(--background)"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
              />
            </svg>
            <span className="truncate font-semibold">
              {translate('codezera.gitGraph.uncommitted', 'Uncommitted changes ({{count}})', {
                count: result.uncommittedCount
              })}
            </span>
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {viewModels.map((viewModel) => {
          const item = viewModel.historyItem
          const expanded = expandedId === item.id
          return (
            <div key={item.id}>
              <GitGraphCommitRow
                viewModel={viewModel}
                expanded={expanded}
                currentBranch={result?.currentBranch ?? null}
                onToggle={toggleCommit}
                onRequest={handleRequest}
                onCommitAction={handleCommitAction}
              />
              {expanded ? (
                <div className="border-b border-border pl-[var(--git-graph-lanes)]">
                  {item.message && item.message.trim() !== item.subject ? (
                    <pre className="whitespace-pre-wrap px-9 py-1.5 font-sans text-xs text-muted-foreground">
                      {item.message.trim()}
                    </pre>
                  ) : null}
                  <GitHistoryCommitFiles
                    state={filesById[item.id] ?? { status: 'loading' }}
                    author={item.authorEmail ? `${item.author} <${item.authorEmail}>` : item.author}
                    timestamp={item.timestamp}
                    onOpenFile={(entry: GitBranchChangeEntry, event) => {
                      revealWorkbench()
                      openCommitFile(item, entry, event)
                    }}
                    onOpenAll={() => {
                      revealWorkbench()
                      void openHistoryCommitDiff(item)
                    }}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
        {result?.hasMore ? (
          <div className="flex justify-center py-2">
            <Button type="button" variant="outline" size="xs" disabled={loading} onClick={loadMore}>
              {translate('codezera.gitGraph.loadMore', 'Load more commits')}
            </Button>
          </div>
        ) : null}
        {result && result.items.length === 0 && !loading ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {translate('codezera.gitGraph.empty', 'No commits yet.')}
          </div>
        ) : null}
      </div>
      <GitGraphRequestDialog request={request} onClose={() => setRequest(null)} onRun={runAction} />
    </div>
  )
}
