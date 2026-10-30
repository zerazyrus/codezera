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
import type { GitHistoryCommitAction } from '@/components/right-sidebar/source-control/sync/git-history-commit-context-menu'
import type { GitHistoryItem } from '../../../../shared/git-history'
import { GitGraphRefBadges } from './git-graph-ref-badges'
import type { GitGraphRequest } from './git-graph-request'
import type { GitGraphRow } from './git-graph-layout'
import { GIT_GRAPH_ROW_HEIGHT, GitGraphRowSvg } from './git-graph-lanes-svg'
import { GitGraphIssueText } from './git-graph-issue-text'
import { GitGraphStashMenuContent, gitGraphStashSelector } from './git-graph-stash-menu'
import type { GitGraphIssueLinking } from '../../../../shared/codezera/git-graph-types'

const pad = (value: number): string => String(value).padStart(2, '0')

/** VS Code Git Graph's date column: `29 Oct 2026 17:00`. */
export function formatGitGraphDate(timestamp: number): string {
  const date = new Date(timestamp)
  const month = uiDateTimeFormat({ month: 'short' }).format(date)
  return `${date.getDate()} ${month} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const GIT_GRAPH_GRID_COLUMNS = 'var(--git-graph-lanes) minmax(0,1fr) 140px 140px 80px'

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
  item,
  row,
  graphWidth,
  isHead,
  expanded,
  currentBranch,
  onToggle,
  onRequest,
  onCommitAction,
  issueLinking
}: {
  item: GitHistoryItem
  row: GitGraphRow
  graphWidth: number
  isHead: boolean
  expanded: boolean
  currentBranch: string | null
  onToggle: (item: GitHistoryItem) => void
  onRequest: (request: GitGraphRequest) => void
  onCommitAction: (action: GitHistoryCommitAction, item: GitHistoryItem) => void
  issueLinking: GitGraphIssueLinking | null
}): React.JSX.Element {
  // VS Code Git Graph mutes merge commits so the work they bring in stands out.
  const muted = item.parentIds.length > 1
  const stashSelector = gitGraphStashSelector(item)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="row"
          tabIndex={0}
          aria-expanded={expanded}
          data-testid="git-graph-commit"
          data-commit-id={item.id}
          className={cn(
            'grid cursor-pointer items-center gap-x-2 pr-2 hover:bg-accent/60 focus-visible:outline-none',
            expanded && 'bg-accent'
          )}
          style={{ gridTemplateColumns: GIT_GRAPH_GRID_COLUMNS, height: GIT_GRAPH_ROW_HEIGHT }}
          onClick={() => onToggle(item)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggle(item)
            }
          }}
        >
          <GitGraphRowSvg row={row} width={graphWidth} node={isHead ? 'hollow' : 'filled'} />
          <div className="flex min-w-0 items-center gap-1">
            <GitGraphRefBadges
              refs={item.references ?? []}
              color={row.color}
              currentBranch={currentBranch}
              onRequest={onRequest}
            />
            <span className={cn('truncate', isHead && 'font-semibold', muted && 'opacity-50')}>
              <GitGraphIssueText text={item.subject} linking={issueLinking} />
            </span>
          </div>
          <span
            className={cn('truncate tabular-nums text-muted-foreground', muted && 'opacity-50')}
          >
            {item.timestamp ? formatGitGraphDate(item.timestamp) : ''}
          </span>
          <span
            className={cn('truncate text-muted-foreground', muted && 'opacity-50')}
            title={item.authorEmail}
          >
            {item.author}
          </span>
          <span
            className={cn(
              'truncate font-mono text-[12px] text-muted-foreground',
              muted && 'opacity-50'
            )}
          >
            {item.id.slice(0, 8)}
          </span>
        </div>
      </ContextMenuTrigger>
      {stashSelector ? (
        <GitGraphStashMenuContent selector={stashSelector} onRequest={onRequest} />
      ) : (
        <CommitMenu
          item={item}
          currentBranch={currentBranch}
          onRequest={onRequest}
          onCommitAction={onCommitAction}
        />
      )}
    </ContextMenu>
  )
})
