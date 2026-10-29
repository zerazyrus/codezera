import {
  GIT_HISTORY_COMMIT_FORMAT,
  parseGitHistoryLog
} from '../../../shared/git-history-log-parser'
import type { GitHistoryExecutor, GitHistoryItem } from '../../../shared/git-history-types'
import {
  GIT_GRAPH_MAX_LIMIT,
  GIT_GRAPH_PAGE_SIZE,
  GIT_GRAPH_STASH_REF_PREFIX,
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

/**
 * Stashes become rows whose only parent is the commit they were taken on, like VS Code Git Graph;
 * their index/untracked helper commits never show.
 */
async function listStashes(git: GitHistoryExecutor, cwd: string): Promise<GitHistoryItem[]> {
  const stdout = await readOptional(git, cwd, [
    'stash',
    'list',
    '--no-color',
    '--format=%H%x00%gd%x00%P%x00%at%x00%aN%x00%aE%x00%s'
  ])
  const stashes: GitHistoryItem[] = []
  for (const line of stdout?.split('\n') ?? []) {
    const [id, selector, parents, authorTime, author, authorEmail, subject] = line.split('\0')
    const baseId = parents?.split(' ')[0]
    if (!id || !selector || !baseId) {
      continue
    }
    stashes.push({
      id,
      parentIds: [baseId],
      subject: subject ?? '',
      message: subject ?? '',
      displayId: id.slice(0, 7),
      author,
      authorEmail,
      timestamp: Number(authorTime) * 1000,
      references: [
        {
          id: `${GIT_GRAPH_STASH_REF_PREFIX}${selector.slice('stash@'.length)}`,
          name: selector,
          revision: id,
          category: 'commits'
        }
      ]
    })
  }
  return stashes
}

/** Each stash lands just above its base commit, or earlier when it is newer than rows above. */
function insertStashes(items: GitHistoryItem[], stashes: GitHistoryItem[]): GitHistoryItem[] {
  const result = [...items]
  for (const stash of stashes) {
    const baseIndex = result.findIndex((item) => item.id === stash.parentIds[0])
    if (baseIndex === -1) {
      continue
    }
    const newerThan = result.findIndex((item) => (item.timestamp ?? 0) < (stash.timestamp ?? 0))
    result.splice(newerThan !== -1 && newerThan < baseIndex ? newerThan : baseIndex, 0, stash)
  }
  return result
}

export async function loadGitGraph(
  git: GitHistoryExecutor,
  cwd: string,
  request: Pick<GitGraphLogRequest, 'refs' | 'showRemoteBranches' | 'limit' | 'options'>
): Promise<GitGraphLogResult> {
  const { options } = request
  const limit = Math.min(
    GIT_GRAPH_MAX_LIMIT,
    Math.max(1, Math.floor(request.limit || GIT_GRAPH_PAGE_SIZE))
  )
  const [headOid, currentBranch, allBranches, porcelain] = await Promise.all([
    readOptional(git, cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']),
    readOptional(git, cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    listBranches(git, cwd),
    readOptional(git, cwd, ['status', '--porcelain=v1', '--untracked-files=all'])
  ])
  // Only names this repo listed become globs, so a hidden remote can never smuggle a git option.
  const hiddenRemotePrefixes = options.hiddenRemotes
    .map((remote) => `refs/remotes/${remote}/`)
    .filter((prefix) => allBranches.some((branch) => branch.fullName.startsWith(prefix)))
  const branches = allBranches.filter(
    (branch) => !hiddenRemotePrefixes.some((prefix) => branch.fullName.startsWith(prefix))
  )
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
      : [
          '--branches',
          // Fetched tags carry no remote, so with a remote hidden they would drag its history back
          // in; they still decorate the commits that stay visible.
          ...(options.showTags && hiddenRemotePrefixes.length === 0 ? ['--tags'] : []),
          ...(request.showRemoteBranches
            ? [
                // `--exclude` before `--remotes` matches names relative to refs/remotes/, so
                // `refs/remotes/x/*` would silently match nothing.
                ...hiddenRemotePrefixes.map(
                  (prefix) => `--exclude=${prefix.slice('refs/remotes/'.length)}*`
                ),
                '--remotes'
              ]
            : []),
          ...(options.includeReflogs ? ['--reflog'] : []),
          'HEAD'
        ]

  const [{ stdout }, stashes] = await Promise.all([
    git(
      [
        'log',
        '--no-show-signature',
        '--no-color',
        `--format=${GIT_HISTORY_COMMIT_FORMAT}`,
        '-z',
        '--date-order',
        ...(options.firstParentOnly ? ['--first-parent'] : []),
        '--decorate=full',
        ...(request.showRemoteBranches ? [] : ['--decorate-refs-exclude=refs/remotes/']),
        ...hiddenRemotePrefixes.map((prefix) => `--decorate-refs-exclude=${prefix}`),
        ...(options.showTags ? [] : ['--decorate-refs-exclude=refs/tags/']),
        `-n${limit + 1}`,
        ...revisions,
        '--'
      ],
      cwd
    ),
    options.showStashes ? listStashes(git, cwd) : Promise.resolve([])
  ])
  const parsed = parseGitHistoryLog(stdout)
  return {
    ...base,
    items: insertStashes(parsed.slice(0, limit), stashes),
    hasMore: parsed.length > limit
  }
}
