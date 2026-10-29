import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CloudDownload, Loader2, RefreshCw } from 'lucide-react'
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
import type { GitHistoryCommitFilesState } from '@/components/right-sidebar/source-control/sync/git-history-commit-files'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { GitHistoryItem } from '../../../../shared/git-history'
import type { GitGraphAction } from '../../../../shared/codezera/git-graph-types'
import {
  GIT_GRAPH_GRID_COLUMNS,
  GitGraphCommitRow,
  formatGitGraphDate
} from './git-graph-commit-row'
import { GitGraphCommitDetails } from './git-graph-commit-details'
import { GitGraphBranchPicker } from './git-graph-branch-picker'
import { GitGraphRequestDialog } from './git-graph-request-dialog'
import type { GitGraphRequest } from './git-graph-request'
import { useGitGraphStore, useGitGraphViewState } from './git-graph-store'
import { useGitGraphLog } from './use-git-graph-log'
import { layoutGitGraph } from './git-graph-layout'
import { GIT_GRAPH_LANE_WIDTH, GIT_GRAPH_ROW_HEIGHT, GitGraphRowSvg } from './git-graph-lanes-svg'

const MIN_GRAPH_COLUMN_WIDTH = 64
const MAX_GRAPH_COLUMN_WIDTH = 400
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
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function HeaderCell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="flex h-full items-center justify-center truncate border-l border-border px-1 first:border-l-0">
      {children}
    </span>
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
  const showRemoteBranches = useGitGraphStore((s) => s.showRemoteBranches)
  const setShowRemoteBranches = useGitGraphStore((s) => s.setShowRemoteBranches)
  const patchView = useGitGraphStore((s) => s.patchView)
  const { selectedRefs, expandedId } = useGitGraphViewState(worktreeId)
  const setSelectedRefs = useCallback(
    (refs: string[] | null) => patchView(worktreeId, { selectedRefs: refs }),
    [patchView, worktreeId]
  )
  const setExpandedId = useCallback(
    (id: string | null) => patchView(worktreeId, { expandedId: id }),
    [patchView, worktreeId]
  )
  const { state, refresh, loadMore } = useGitGraphLog({
    worktreeId,
    worktreePath,
    selectedRefs,
    showRemoteBranches
  })
  const result = state.result
  const [filesById, setFilesById] = useState<Record<string, GitHistoryCommitFilesState>>({})
  const [request, setRequest] = useState<Exclude<GitGraphRequest, { kind: 'run' }> | null>(null)
  const [fetching, setFetching] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { loadCommitFiles, openCommitFile, openHistoryCommitDiff, handleCommitAction } =
    useGitHistoryCommitActions({
      activeWorktreeId: worktreeId,
      worktreePath,
      activeRepoTarget: repoTarget,
      resolveSplitTargetGroupId: NO_SPLIT_GROUP
    })

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

  const layout = useMemo(
    () =>
      layoutGitGraph(
        result?.items ?? [],
        result?.headOid ?? null,
        (result?.uncommittedCount ?? 0) > 0
      ),
    [result]
  )
  const graphWidth = Math.min(
    MAX_GRAPH_COLUMN_WIDTH,
    Math.max(MIN_GRAPH_COLUMN_WIDTH, GIT_GRAPH_LANE_WIDTH * layout.laneCount + 12)
  )

  const expandedItem = expandedId
    ? (result?.items.find((item) => item.id === expandedId) ?? null)
    : null
  const expandedFilesStatus = expandedId ? filesById[expandedId]?.status : undefined
  // Also covers a remounted tab whose expanded commit survived in the store.
  useEffect(() => {
    if (!expandedItem || expandedFilesStatus !== undefined) {
      return
    }
    const id = expandedItem.id
    setFilesById((prev) => ({ ...prev, [id]: { status: 'loading' } }))
    loadCommitFiles(expandedItem).then(
      (entries) => setFilesById((prev) => ({ ...prev, [id]: { status: 'ready', entries } })),
      (error: unknown) =>
        setFilesById((prev) => ({
          ...prev,
          [id]: { status: 'error', error: error instanceof Error ? error.message : String(error) }
        }))
    )
  }, [expandedFilesStatus, expandedItem, loadCommitFiles])

  const toggleCommit = useCallback(
    (item: GitHistoryItem) => setExpandedId(expandedId === item.id ? null : item.id),
    [expandedId, setExpandedId]
  )

  const selectCommit = useCallback(
    (id: string) => {
      setExpandedId(id)
      requestAnimationFrame(() =>
        scrollRef.current
          ?.querySelector(`[data-commit-id="${id}"]`)
          ?.scrollIntoView({ block: 'nearest' })
      )
    },
    [setExpandedId]
  )

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
  const lanesStyle = { ['--git-graph-lanes' as string]: `${graphWidth}px` }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background text-[13px]"
      data-testid="git-graph-view"
    >
      <div className="relative flex h-10 shrink-0 items-center justify-center gap-3 border-b border-border px-3">
        <span className="font-bold">
          {translate('codezera.gitGraph.branchesLabel', 'Branches')}:
        </span>
        <GitGraphBranchPicker
          branches={result?.branches ?? []}
          selectedRefs={selectedRefs}
          showRemoteBranches={showRemoteBranches}
          onChange={setSelectedRefs}
        />
        <Label className="flex items-center gap-1.5 text-[13px] font-bold">
          <Checkbox
            checked={showRemoteBranches}
            onCheckedChange={(value) => setShowRemoteBranches(value === true)}
          />
          {translate('codezera.gitGraph.showRemote', 'Show Remote Branches')}
        </Label>
        <div className="absolute right-2 flex items-center gap-0.5">
          {loading ? <Loader2 className="mr-1 size-4 animate-spin text-muted-foreground" /> : null}
          <ToolbarIconButton
            label={translate('codezera.gitGraph.fetch', 'Fetch from Remote(s)')}
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
        </div>
      </div>
      <div
        className="grid h-8 shrink-0 items-center gap-x-2 border-b border-border pr-2 font-bold"
        style={{ gridTemplateColumns: GIT_GRAPH_GRID_COLUMNS, ...lanesStyle }}
      >
        <HeaderCell>{translate('codezera.gitGraph.column.graph', 'Graph')}</HeaderCell>
        <HeaderCell>{translate('codezera.gitGraph.column.description', 'Description')}</HeaderCell>
        <HeaderCell>{translate('codezera.gitGraph.column.date', 'Date')}</HeaderCell>
        <HeaderCell>{translate('codezera.gitGraph.column.author', 'Author')}</HeaderCell>
        <HeaderCell>{translate('codezera.gitGraph.column.commit', 'Commit')}</HeaderCell>
      </div>
      <div
        ref={scrollRef}
        role="table"
        className="scrollbar-sleek min-h-0 flex-1 overflow-auto"
        style={lanesStyle}
      >
        {state.status === 'error' ? (
          <div className="px-3 py-2 text-destructive">{state.error}</div>
        ) : null}
        {result && layout.uncommitted ? (
          <div
            role="row"
            tabIndex={0}
            className="grid cursor-pointer items-center gap-x-2 pr-2 hover:bg-accent/60"
            style={{ gridTemplateColumns: GIT_GRAPH_GRID_COLUMNS, height: GIT_GRAPH_ROW_HEIGHT }}
            onClick={openSourceControl}
            onKeyDown={(event) => (event.key === 'Enter' ? openSourceControl() : undefined)}
          >
            <GitGraphRowSvg row={layout.uncommitted} width={graphWidth} node="hollow" />
            <span className="truncate font-bold">
              {translate('codezera.gitGraph.uncommitted', 'Uncommitted Changes ({{count}})', {
                count: result.uncommittedCount
              })}
            </span>
            <span className="truncate tabular-nums">{formatGitGraphDate(result.loadedAt)}</span>
            <span>*</span>
            <span>*</span>
          </div>
        ) : null}
        {result?.items.map((item, index) => {
          const row = layout.rows[index]!
          const expanded = expandedId === item.id
          return (
            <div key={item.id}>
              <GitGraphCommitRow
                item={item}
                row={row}
                graphWidth={graphWidth}
                isHead={item.id === result.headOid}
                expanded={expanded}
                currentBranch={result.currentBranch}
                onToggle={toggleCommit}
                onRequest={handleRequest}
                onCommitAction={handleCommitAction}
              />
              {expanded ? (
                <GitGraphCommitDetails
                  item={item}
                  files={filesById[item.id] ?? { status: 'loading' }}
                  lanes={row.below}
                  graphWidth={graphWidth}
                  onOpenFile={(entry, event) => openCommitFile(item, entry, event)}
                  onOpenAll={() => void openHistoryCommitDiff(item)}
                  onSelectCommit={selectCommit}
                  onClose={() => setExpandedId(null)}
                />
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
          <div className="px-3 py-2 text-muted-foreground">
            {translate('codezera.gitGraph.empty', 'No commits yet.')}
          </div>
        ) : null}
      </div>
      <GitGraphRequestDialog request={request} onClose={() => setRequest(null)} onRun={runAction} />
    </div>
  )
}
