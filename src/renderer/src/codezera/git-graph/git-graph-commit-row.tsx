import type React from 'react'
import { memo } from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { uiDateTimeFormat } from '@/i18n/ui-intl-formatters'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { GitHistoryGraphSvg } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitHistoryCommitAction } from '@/components/right-sidebar/source-control/sync/git-history-commit-context-menu'
import type { GitHistoryItem } from '../../../../shared/git-history'
import type { GitHistoryItemViewModel } from '../../../../shared/git-history-graph'
import { GitGraphRefBadges } from './git-graph-ref-badges'
import type { GitGraphRequest } from './git-graph-request'

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}

export const GIT_GRAPH_GRID_COLUMNS = 'var(--git-graph-lanes) minmax(0,1fr) 150px 150px 80px'

function CommitMenu({
  item,
  currentBranch,
  onRequest,
  onCommitAction
}: {
  item: GitHistoryItem
  currentBranch: string | null
  onRequest: (request: GitGraphRequest) => void
  onCommitAction: (action: GitHistoryCommitAction, item: GitHistoryItem) => void
}): React.JSX.Element {
  const shortId = item.id.slice(0, 7)
  const target = currentBranch ?? 'HEAD'
  const mainline = item.parentIds.length > 1 ? 1 : undefined
  return (
    <ContextMenuContent className="w-64">
      <ContextMenuItem onSelect={() => onRequest({ kind: 'createBranch', startPoint: item.id })}>
        {translate('codezera.gitGraph.commit.addBranch', 'Create branch here…')}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          onRequest({
            kind: 'confirm',
            title: translate('codezera.gitGraph.commit.checkoutTitle', 'Checkout commit'),
            description: translate(
              'codezera.gitGraph.commit.checkoutDescription',
              'Checks out {{commit}} as a detached HEAD.',
              { commit: shortId }
            ),
            action: { kind: 'checkout', ref: item.id }
          })
        }
      >
        {translate('codezera.gitGraph.commit.checkout', 'Checkout (detached)…')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={() =>
          onRequest({
            kind: 'confirm',
            title: translate('codezera.gitGraph.commit.cherryPickTitle', 'Cherry-pick commit'),
            description: `${shortId} → ${target}`,
            action: { kind: 'cherryPick', commit: item.id, mainline }
          })
        }
      >
        {translate('codezera.gitGraph.commit.cherryPick', 'Cherry-pick…')}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          onRequest({
            kind: 'confirm',
            title: translate('codezera.gitGraph.commit.revertTitle', 'Revert commit'),
            description: translate(
              'codezera.gitGraph.commit.revertDescription',
              'Creates a commit on {{target}} that undoes {{commit}}.',
              { target, commit: shortId }
            ),
            action: { kind: 'revert', commit: item.id, mainline }
          })
        }
      >
        {translate('codezera.gitGraph.commit.revert', 'Revert…')}
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          {translate('codezera.gitGraph.commit.reset', 'Reset {{target}} to this commit', {
            target
          })}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-56">
          {(['soft', 'mixed', 'hard'] as const).map((mode) => (
            <ContextMenuItem
              key={mode}
              variant={mode === 'hard' ? 'destructive' : 'default'}
              onSelect={() =>
                onRequest({
                  kind: 'confirm',
                  title: translate('codezera.gitGraph.commit.resetTitle', 'Reset ({{mode}})', {
                    mode
                  }),
                  description:
                    mode === 'hard'
                      ? translate(
                          'codezera.gitGraph.commit.resetHard',
                          'Moves {{target}} to {{commit}} and discards every uncommitted change.',
                          { target, commit: shortId }
                        )
                      : translate(
                          'codezera.gitGraph.commit.resetKeep',
                          'Moves {{target}} to {{commit}} and keeps changes in the working tree.',
                          { target, commit: shortId }
                        ),
                  action: { kind: 'reset', commit: item.id, mode },
                  destructive: mode === 'hard'
                })
              }
            >
              {mode === 'soft'
                ? translate('codezera.gitGraph.commit.resetSoft', 'Soft — keep changes staged')
                : mode === 'mixed'
                  ? translate(
                      'codezera.gitGraph.commit.resetMixed',
                      'Mixed — keep changes unstaged'
                    )
                  : translate('codezera.gitGraph.commit.resetHardItem', 'Hard — discard changes…')}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onCommitAction('copy-hash', item)}>
        {translate('codezera.gitGraph.commit.copyHash', 'Copy commit hash')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onCommitAction('copy-message', item)}>
        {translate('codezera.gitGraph.commit.copyMessage', 'Copy commit message')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onCommitAction('open-remote', item)}>
        {translate('codezera.gitGraph.commit.openRemote', 'Open commit in browser')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onCommitAction('explain', item)}>
        {translate('codezera.gitGraph.commit.explain', 'Explain changes')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

export const GitGraphCommitRow = memo(function GitGraphCommitRow({
  viewModel,
  expanded,
  currentBranch,
  onToggle,
  onRequest,
  onCommitAction
}: {
  viewModel: GitHistoryItemViewModel
  expanded: boolean
  currentBranch: string | null
  onToggle: (item: GitHistoryItem) => void
  onRequest: (request: GitGraphRequest) => void
  onCommitAction: (action: GitHistoryCommitAction, item: GitHistoryItem) => void
}): React.JSX.Element {
  const item = viewModel.historyItem
  const isHead = viewModel.kind === 'HEAD'
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="row"
          tabIndex={0}
          aria-expanded={expanded}
          data-testid="git-graph-commit"
          className={cn(
            'grid h-6 cursor-pointer items-center gap-x-3 pr-3 text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
            expanded && 'bg-accent'
          )}
          style={{ gridTemplateColumns: GIT_GRAPH_GRID_COLUMNS }}
          onClick={() => onToggle(item)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggle(item)
            }
          }}
        >
          <div className="h-6 overflow-hidden">
            <GitHistoryGraphSvg viewModel={viewModel} />
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <GitGraphRefBadges
              refs={item.references ?? []}
              currentBranch={currentBranch}
              onRequest={onRequest}
            />
            <span
              className={cn(
                'truncate',
                isHead ? 'font-semibold text-foreground' : 'text-foreground'
              )}
            >
              {item.subject}
            </span>
          </div>
          <span className="truncate tabular-nums text-muted-foreground">
            {item.timestamp ? uiDateTimeFormat(DATE_OPTIONS).format(item.timestamp) : ''}
          </span>
          <span className="truncate text-muted-foreground" title={item.authorEmail}>
            {item.author}
          </span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {item.id.slice(0, 8)}
          </span>
        </div>
      </ContextMenuTrigger>
      <CommitMenu
        item={item}
        currentBranch={currentBranch}
        onRequest={onRequest}
        onCommitAction={onCommitAction}
      />
    </ContextMenu>
  )
})
