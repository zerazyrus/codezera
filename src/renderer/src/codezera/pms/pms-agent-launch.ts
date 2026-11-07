import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { prepareDirectWorkItemSetup } from '@/lib/direct-work-item-setup'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { resolveDefaultAgentForWorktreeNewTab } from '@/lib/agent-tab-shortcuts'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/repo-types'

const PROJECT_REPOS_KEY = 'codezera.pms.projectRepos'

/** Repo last used per PMS project, so taking the next ticket of a project needs no picking. */
export function pmsProjectRepo(projectId: string | null): string | null {
  if (!projectId) {
    return null
  }
  try {
    const map = JSON.parse(localStorage.getItem(PROJECT_REPOS_KEY) ?? '{}') as Record<
      string,
      string
    >
    return map[projectId] ?? null
  } catch {
    return null
  }
}

export function rememberPmsProjectRepo(projectId: string | null, repoId: string): void {
  if (!projectId) {
    return
  }
  let map: Record<string, string> = {}
  try {
    map = JSON.parse(localStorage.getItem(PROJECT_REPOS_KEY) ?? '{}') as Record<string, string>
  } catch {
    // A corrupt entry is replaced.
  }
  localStorage.setItem(PROJECT_REPOS_KEY, JSON.stringify({ ...map, [projectId]: repoId }))
}

/** Opens the worktree and starts the default agent on the prompt; without an agent only opens it. */
async function startAgent(worktreeId: string, prompt: string): Promise<void> {
  const agent = await resolveDefaultAgentForWorktreeNewTab(useAppStore.getState, worktreeId)
  if (!agent) {
    activateAndRevealWorktree(worktreeId, { sidebarRevealBehavior: 'auto' })
    return
  }
  launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    agent,
    worktreeId,
    prompt,
    promptDelivery: 'submit-after-ready',
    // The launcher opens the agent surface; revealing must not seed a sibling shell.
    beforeSurfaceOpen: () =>
      activateAndRevealWorktree(worktreeId, {
        sidebarRevealBehavior: 'auto',
        providesInitialSurface: true
      }) !== false
  })
}

function findRepo(repoId: string): Repo {
  const repo = useAppStore.getState().repos.find((entry) => entry.id === repoId)
  if (!repo) {
    throw new Error('The project is no longer open in Codezera.')
  }
  return repo
}

/** New worktree on an exact git-flow branch (`bug/#27463-…`), then the agent; false when the user cancels setup. */
export async function startPmsWorktree(args: {
  repoId: string
  name: string
  displayName: string
  branch: string
  prompt: string
}): Promise<boolean> {
  const repo = findRepo(args.repoId)
  if (!isGitRepoKind(repo)) {
    throw new Error(`${repo.displayName} is a folder, not a git repository.`)
  }
  const hostId = getRepoExecutionHostId(repo)
  const setup = await prepareDirectWorkItemSetup(repo, hostId)
  if (setup === 'cancelled' || setup === 'review-request') {
    return false
  }
  const store = useAppStore.getState()
  const created = await store.createWorktree(
    repo.id,
    args.name,
    undefined,
    setup,
    undefined,
    'unknown',
    args.displayName,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    args.branch,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { executionHostId: hostId }
  )
  await startAgent(created.worktree.id, args.prompt)
  return true
}

/** The repo's own checkout (no new worktree), for work that must happen on master. */
export async function startPmsInMainCheckout(args: {
  repoId: string
  prompt: string
}): Promise<void> {
  const repo = findRepo(args.repoId)
  const hostId = getRepoExecutionHostId(repo)
  const mainOf = (): string | undefined =>
    (selectWorktreesByRepo(useAppStore.getState())[repo.id] ?? []).find(
      (worktree) => worktree.isMainWorktree && (!worktree.hostId || worktree.hostId === hostId)
    )?.id
  let worktreeId = mainOf()
  if (!worktreeId) {
    await useAppStore.getState().fetchWorktrees(repo.id)
    worktreeId = mainOf()
  }
  if (!worktreeId) {
    throw new Error(`Cannot find the main checkout of ${repo.displayName}.`)
  }
  await startAgent(worktreeId, args.prompt)
}
