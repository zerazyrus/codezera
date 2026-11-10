import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, GitBranch, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/workspaces/selection/use-selected-worktree'
import { useRepoById } from '@/store/repos/use-repository-catalog'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
import { branchName } from '@/lib/source-control/branches/branch-name'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { useWorktreeGitOwnerTarget } from '@/components/right-sidebar/source-control/sync/worktree-git-owner-target'
import { splitRemoteBranchName } from '../../../../shared/git/remotes/git-remote-branch-name'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { shouldForcePushWithLeaseForUpstream } from '../../../../shared/git/remotes/git-upstream-status'
import {
  DEFAULT_GIT_GRAPH_REPO_SETTINGS,
  type GitGraphAction,
  type GitGraphBranch
} from '../../../../shared/codezera/git-graph-types'

const MAX_LISTED_BRANCHES = 300

/** VS Code-style status bar branch: shows the current branch, switches it, and syncs (pull then push). Local git workspaces only. */
export function CodezeraBranchStatusSegment({
  compact
}: {
  compact: boolean
}): React.JSX.Element | null {
  const worktree = useActiveWorktree()
  const repo = useRepoById(worktree?.repoId ?? null)
  const ownerTarget = useWorktreeGitOwnerTarget(worktree?.id ?? null)
  const worktreeId = worktree?.id ?? null
  const worktreePath = worktree?.path ?? null
  const upstream = useAppStore((s) => (worktreeId ? s.remoteStatusesByWorktree[worktreeId] : null))
  const syncing = useAppStore((s) => s.remoteOperations.some((op) => op.worktreeId === worktreeId))
  // Orca's status poller notices checkouts made elsewhere (terminal, agents).
  const statusHead = useAppStore((s) => (worktreeId ? s.gitStatusHeadByWorktree[worktreeId] : null))
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [branches, setBranches] = useState<GitGraphBranch[]>([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [switching, setSwitching] = useState(false)

  const usable = Boolean(worktree && ownerTarget?.kind === 'local' && !(repo && isFolderRepo(repo)))

  const load = useCallback(async (): Promise<void> => {
    if (!usable || !worktreeId || !worktreePath) {
      return
    }
    try {
      const { hiddenRemotes } = DEFAULT_GIT_GRAPH_REPO_SETTINGS
      const result = await window.api.codezera.gitGraph.log({
        worktreePath,
        connectionId: getConnectionId(worktreeId) ?? undefined,
        refs: null,
        showRemoteBranches: true,
        limit: 1,
        options: {
          showStashes: false,
          showTags: false,
          includeReflogs: false,
          firstParentOnly: true,
          hiddenRemotes
        }
      })
      setCurrentBranch(result.currentBranch)
      setBranches(result.branches)
    } catch (error) {
      console.warn('[codezera] branch status could not read branches', error)
    }
  }, [usable, worktreeId, worktreePath])

  useEffect(() => {
    void load()
  }, [load, statusHead, worktree?.branch])

  useEffect(() => {
    if (usable && worktreeId && worktreePath) {
      void useAppStore
        .getState()
        .fetchUpstreamStatus(
          worktreeId,
          worktreePath,
          getConnectionId(worktreeId) ?? undefined,
          worktree?.pushTarget
        )
    }
  }, [usable, worktreeId, worktreePath, currentBranch, worktree?.pushTarget])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = branches.filter((b) => !needle || b.name.toLowerCase().includes(needle))
    return {
      local: matches.filter((b) => !b.remote).slice(0, MAX_LISTED_BRANCHES),
      remote: matches.filter((b) => b.remote).slice(0, MAX_LISTED_BRANCHES)
    }
  }, [branches, query])

  if (!usable || !worktree || !worktreeId || !worktreePath) {
    return null
  }

  const label = currentBranch ?? (worktree.branch ? branchName(worktree.branch) : 'HEAD')
  const connectionId = getConnectionId(worktreeId) ?? undefined

  const checkout = async (branch: GitGraphBranch): Promise<void> => {
    setOpen(false)
    setQuery('')
    const split = branch.remote ? splitRemoteBranchName(branch.name) : null
    const action: GitGraphAction = split
      ? { kind: 'checkoutRemoteBranch', remoteBranch: branch.name, localName: split.branchName }
      : { kind: 'checkout', ref: branch.name }
    setSwitching(true)
    try {
      await window.api.codezera.gitGraph.runAction({ worktreePath, connectionId, action })
    } catch (error) {
      toast.error(translate('codezera.branchStatus.checkoutFailed', 'Could not switch branch'), {
        description: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setSwitching(false)
      void load()
    }
  }

  const sync = (): void => {
    // The store toasts sync failures itself.
    useAppStore
      .getState()
      .syncBranch(worktreeId, worktreePath, connectionId, worktree.pushTarget)
      .catch(() => {})
  }

  const behind = upstream?.hasUpstream ? upstream.behind : 0
  const ahead = upstream?.hasUpstream ? upstream.ahead : 0
  // Rewritten history needs a force push; like Orca's Sync menu item, leave that to Source Control.
  const needsForcePush = Boolean(upstream && shouldForcePushWithLeaseForUpstream(upstream))
  const syncLabel = !upstream?.hasUpstream
    ? translate('codezera.branchStatus.noUpstream', 'This branch has no upstream to sync with')
    : needsForcePush
      ? translate(
          'codezera.branchStatus.needsForcePush',
          'History was rewritten; force push from Source Control'
        )
      : translate('codezera.branchStatus.sync', 'Synchronize changes with {{upstream}}', {
          upstream: upstream.upstreamName ?? 'upstream'
        })

  return (
    <span className="inline-flex shrink-0 items-center">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) {
            void load()
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex max-w-[14rem] items-center gap-1 rounded px-1 py-0.5 hover:bg-accent/70"
                aria-label={translate('codezera.branchStatus.switch', 'Switch branch')}
              >
                {switching ? (
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                ) : (
                  <GitBranch className="size-3 shrink-0" />
                )}
                {!compact ? <span className="truncate">{label}</span> : null}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {translate('codezera.branchStatus.tooltip', '{{branch}} · click to switch branch', {
              branch: label
            })}
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="start" side="top" className="w-72 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={translate('codezera.branchStatus.search', 'Select a branch to checkout')}
            />
            <CommandList>
              <CommandEmpty>
                {translate('codezera.branchStatus.empty', 'No matching branch')}
              </CommandEmpty>
              {[
                {
                  key: 'local',
                  heading: translate('codezera.branchStatus.local', 'Branches'),
                  items: visible.local
                },
                {
                  key: 'remote',
                  heading: translate('codezera.branchStatus.remote', 'Remote branches'),
                  items: visible.remote
                }
              ].map((group) =>
                group.items.length > 0 ? (
                  <CommandGroup key={group.key} heading={group.heading}>
                    {group.items.map((branch) => (
                      <CommandItem
                        key={branch.fullName}
                        value={branch.fullName}
                        onSelect={() => {
                          if (!branch.remote && branch.name === currentBranch) {
                            setOpen(false)
                            return
                          }
                          void checkout(branch)
                        }}
                      >
                        <Check
                          className={cn(
                            'size-3.5',
                            !branch.remote && branch.name === currentBranch
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        <span className="truncate">{branch.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 tabular-nums hover:bg-accent/70 disabled:opacity-50 disabled:hover:bg-transparent"
            aria-label={syncLabel}
            disabled={!upstream?.hasUpstream || needsForcePush || syncing}
            onClick={sync}
          >
            {syncing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : behind === 0 && ahead === 0 ? (
              <RefreshCw className="size-3" />
            ) : null}
            {behind > 0 ? (
              <>
                <ArrowDown className="size-3" />
                <span>{behind}</span>
              </>
            ) : null}
            {ahead > 0 ? (
              <>
                <ArrowUp className="size-3" />
                <span>{ahead}</span>
              </>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {syncLabel}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}
