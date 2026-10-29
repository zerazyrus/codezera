import type { GitHistoryExecutor } from '../../../shared/git-history-types'
import type { GitGraphRemote, GitGraphRepoInfo } from '../../../shared/codezera/git-graph-types'

async function configValue(
  git: GitHistoryExecutor,
  cwd: string,
  args: string[]
): Promise<string | null> {
  try {
    return (await git(['config', ...args], cwd)).stdout.trim() || null
  } catch {
    // Exit 1: key unset.
    return null
  }
}

export function parseGitRemotes(stdout: string): GitGraphRemote[] {
  const remotes = new Map<string, GitGraphRemote>()
  for (const line of stdout.split('\n')) {
    const match = /^(\S+)\t(\S+) \((fetch|push)\)$/.exec(line.trim())
    if (!match) {
      continue
    }
    const [, name, url, kind] = match as unknown as [string, string, string, 'fetch' | 'push']
    const remote = remotes.get(name) ?? { name, fetchUrl: null, pushUrl: null }
    if (kind === 'fetch') {
      remote.fetchUrl = url
    } else {
      remote.pushUrl = url
    }
    remotes.set(name, remote)
  }
  return [...remotes.values()]
}

export async function loadGitGraphRepoInfo(
  git: GitHistoryExecutor,
  cwd: string
): Promise<GitGraphRepoInfo> {
  const [userName, userEmail, localName, localEmail, remotes] = await Promise.all([
    configValue(git, cwd, ['--get', 'user.name']),
    configValue(git, cwd, ['--get', 'user.email']),
    configValue(git, cwd, ['--local', '--get', 'user.name']),
    configValue(git, cwd, ['--local', '--get', 'user.email']),
    git(['remote', '-v'], cwd).then((result) => parseGitRemotes(result.stdout))
  ])
  const userScope = localName || localEmail ? 'local' : userName || userEmail ? 'global' : null
  return { userName, userEmail, userScope, remotes }
}
