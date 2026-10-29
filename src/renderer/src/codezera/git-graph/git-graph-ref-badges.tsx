import type React from 'react'
import { Cloud, GitBranch, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { splitRemoteBranchName } from '../../../../shared/git-remote-branch-name'
import type { GitHistoryItemRef } from '../../../../shared/git-history'
import type { GitGraphRequest } from './git-graph-request'

type BadgeGroup = {
  ref: GitHistoryItemRef
  /** Remotes whose same-named branch sits on this commit, shown inside the local pill like VS Code Git Graph. */
  remotes: string[]
}

function groupRefs(refs: readonly GitHistoryItemRef[]): BadgeGroup[] {
  const localNames = new Set(
    refs.filter((ref) => ref.category === 'branches').map((ref) => ref.name)
  )
  const groups = new Map<string, BadgeGroup>()
  const standalone: BadgeGroup[] = []
  for (const ref of refs) {
    if (ref.category === 'branches') {
      groups.set(ref.name, groups.get(ref.name) ?? { ref, remotes: [] })
      continue
    }
    const split = ref.category === 'remote branches' ? splitRemoteBranchName(ref.name) : null
    if (split && localNames.has(split.branchName)) {
      const group = groups.get(split.branchName)
      if (group) {
        group.remotes.push(split.remoteName)
      } else {
        groups.set(split.branchName, {
          ref:
            refs.find(
              (candidate) =>
                candidate.category === 'branches' && candidate.name === split.branchName
            ) ?? ref,
          remotes: [split.remoteName]
        })
      }
      continue
    }
    standalone.push({ ref, remotes: [] })
  }
  return [...groups.values(), ...standalone]
}

function BadgeMenu({
  group,
  currentBranch,
  onRequest
}: {
  group: BadgeGroup
  currentBranch: string | null
  onRequest: (request: GitGraphRequest) => void
}): React.JSX.Element {
  const { ref } = group
  const isCurrent = ref.category === 'branches' && ref.name === currentBranch
  if (ref.category === 'remote branches') {
    const split = splitRemoteBranchName(ref.name)
    return (
      <ContextMenuContent className="w-60">
        {split ? (
          <ContextMenuItem
            onSelect={() =>
              onRequest({
                kind: 'run',
                label: translate('codezera.gitGraph.checkout.remote', 'Checkout'),
                action: {
                  kind: 'checkoutRemoteBranch',
                  remoteBranch: ref.name,
                  localName: split.branchName
                }
              })
            }
          >
            {translate('codezera.gitGraph.checkout.remoteBranch', 'Checkout as local branch')}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onSelect={() =>
            onRequest({
              kind: 'confirm',
              title: translate('codezera.gitGraph.merge.title', 'Merge branch'),
              description: `${ref.name} → ${currentBranch ?? 'HEAD'}`,
              action: { kind: 'merge', ref: ref.name }
            })
          }
        >
          {translate('codezera.gitGraph.merge.item', 'Merge into current branch…')}
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }
  if (ref.category === 'tags') {
    return (
      <ContextMenuContent className="w-60">
        <ContextMenuItem
          onSelect={() =>
            onRequest({
              kind: 'run',
              label: translate('codezera.gitGraph.checkout.tag', 'Checkout'),
              action: { kind: 'checkout', ref: ref.name }
            })
          }
        >
          {translate('codezera.gitGraph.checkout.tagItem', 'Checkout tag (detached)')}
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }
  return (
    <ContextMenuContent className="w-60">
      <ContextMenuItem
        disabled={isCurrent}
        onSelect={() =>
          onRequest({
            kind: 'run',
            label: translate('codezera.gitGraph.checkout.branch', 'Checkout'),
            action: { kind: 'checkout', ref: ref.name }
          })
        }
      >
        {translate('codezera.gitGraph.checkout.branchItem', 'Checkout branch')}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={isCurrent}
        onSelect={() =>
          onRequest({
            kind: 'confirm',
            title: translate('codezera.gitGraph.merge.title', 'Merge branch'),
            description: `${ref.name} → ${currentBranch ?? 'HEAD'}`,
            action: { kind: 'merge', ref: ref.name }
          })
        }
      >
        {translate('codezera.gitGraph.merge.item', 'Merge into current branch…')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={isCurrent}
        variant="destructive"
        onSelect={() =>
          onRequest({
            kind: 'confirm',
            title: translate('codezera.gitGraph.deleteBranch.title', 'Delete branch'),
            description: translate(
              'codezera.gitGraph.deleteBranch.description',
              'Deletes the local branch. Unmerged commits are refused unless forced.'
            ),
            action: { kind: 'deleteBranch', name: ref.name, force: false },
            destructive: true
          })
        }
      >
        {translate('codezera.gitGraph.deleteBranch.item', 'Delete branch…')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

export function GitGraphRefBadges({
  refs,
  color,
  currentBranch,
  onRequest
}: {
  refs: readonly GitHistoryItemRef[]
  /** The commit's lane color; every badge on the row shares it, like VS Code Git Graph. */
  color: string
  currentBranch: string | null
  onRequest: (request: GitGraphRequest) => void
}): React.JSX.Element | null {
  if (refs.length === 0) {
    return null
  }
  return (
    // Menu items render in a portal but still bubble through React to the row's toggle.
    <span className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {groupRefs(refs).map((group) => {
        const { ref } = group
        const Icon =
          ref.category === 'tags' ? Tag : ref.category === 'remote branches' ? Cloud : GitBranch
        const isCurrent = ref.category === 'branches' && ref.name === currentBranch
        return (
          <ContextMenu key={ref.id}>
            <ContextMenuTrigger asChild>
              <span
                data-testid="git-graph-ref"
                className="inline-flex h-[18px] max-w-[18rem] items-stretch overflow-hidden rounded-[3px] border leading-4"
                style={{ borderColor: color }}
              >
                {isCurrent ? (
                  <span className="flex items-center pl-1" aria-hidden="true">
                    <span className="size-2 rounded-full border-2" style={{ borderColor: color }} />
                  </span>
                ) : null}
                <span className="flex items-center px-[3px]" style={{ backgroundColor: color }}>
                  <Icon className="size-3 shrink-0 text-white" />
                </span>
                <span
                  className={cn(
                    'flex items-center truncate px-1.5 text-foreground',
                    isCurrent && 'font-bold'
                  )}
                >
                  {ref.name}
                </span>
                {group.remotes.map((remote) => (
                  <span
                    key={remote}
                    className="flex items-center border-l px-1.5 italic text-muted-foreground"
                    style={{ borderColor: color }}
                  >
                    {remote}
                  </span>
                ))}
              </span>
            </ContextMenuTrigger>
            <BadgeMenu group={group} currentBranch={currentBranch} onRequest={onRequest} />
          </ContextMenu>
        )
      })}
    </span>
  )
}
