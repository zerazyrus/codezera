import {
  GIT_HISTORY_COMMIT_FORMAT,
  parseGitHistoryLog
} from '../../../shared/git-history-log-parser'
import type { GitHistoryExecutor } from '../../../shared/git-history-types'
import {
  GIT_GRAPH_MAX_LIMIT,
  GIT_GRAPH_PAGE_SIZE,
  type GitGraphBranch,
  type GitGraphLogRequest,
  type GitGraphLogResult
} from '../../../shared/codezera/git-graph-types'

async function readOptional(
  git: GitHistoryExecutor,
  cwd: string,
  args: string[]
): Promise<string | null> {
  try {
    return (await git(args, cwd)).stdout.trim() || null
  } catch {
    return null
  }
}

async function listBranches(git: GitHistoryExecutor, cwd: string): Promise<GitGraphBranch[]> {
  const { stdout } = await git(
    [
      'for-each-ref',
      '--format=%(refname)%00%(refname:short)%00%(symref)',
      'refs/heads',
      'refs/remotes'
    ],
    cwd
  )
  const branches: GitGraphBranch[] = []
  for (const line of stdout.split('\n')) {
    const [fullName, name, symref] = line.split('\0')
    // Skip `origin/HEAD`-style symrefs; they duplicate the branch they point at.
    if (!fullName || !name || symref) {
      continue
    }
    branches.push({ name, fullName, remote: fullName.startsWith('refs/remotes/') })
  }
  return branches
}

export async function loadGitGraph(
  git: GitHistoryExecutor,
  cwd: string,
  request: Pick<GitGraphLogRequest, 'refs' | 'showRemoteBranches' | 'limit'>
): Promise<GitGraphLogResult> {
  const limit = Math.min(
    GIT_GRAPH_MAX_LIMIT,
    Math.max(1, Math.floor(request.limit || GIT_GRAPH_PAGE_SIZE))
  )
  const [headOid, currentBranch, branches, porcelain] = await Promise.all([
    readOptional(git, cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']),
    readOptional(git, cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    listBranches(git, cwd),
    readOptional(git, cwd, ['status', '--porcelain=v1', '--untracked-files=all'])
  ])
  const uncommittedCount = porcelain ? porcelain.split('\n').filter(Boolean).length : 0
  const base = { limit, headOid, currentBranch, branches, uncommittedCount, loadedAt: Date.now() }
  if (!headOid) {
    return { ...base, items: [], hasMore: false }
  }

  // Only accept refs this repo listed, so a filter can never smuggle a git option.
  const known = new Set(branches.map((branch) => branch.fullName))
  const selected = request.refs?.filter((ref) => known.has(ref)) ?? null
  const revisions =
    selected && selected.length > 0
      ? selected
      : ['--branches', '--tags', ...(request.showRemoteBranches ? ['--remotes'] : []), 'HEAD']

  const { stdout } = await git(
    [
      'log',
      '--no-show-signature',
      '--no-color',
      `--format=${GIT_HISTORY_COMMIT_FORMAT}`,
      '-z',
      '--date-order',
      '--decorate=full',
      ...(request.showRemoteBranches ? [] : ['--decorate-refs-exclude=refs/remotes/']),
      `-n${limit + 1}`,
      ...revisions,
      '--'
    ],
    cwd
  )
  const parsed = parseGitHistoryLog(stdout)
  return { ...base, items: parsed.slice(0, limit), hasMore: parsed.length > limit }
}
