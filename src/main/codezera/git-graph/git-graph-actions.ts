import type { GitHistoryExecutor } from '../../../shared/git-history-types'
import type { GitGraphAction } from '../../../shared/codezera/git-graph-types'

const COMMIT_OID = /^[0-9a-f]{7,64}$/i

/** Renderer input becomes git argv: refuse anything git could read as an option; git rejects the rest of bad ref names. */
function requireRefArg(value: string, label: string): string {
  if (!value || value.startsWith('-') || value.length > 255 || /[\s~^:?*[\\]/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return value
}

function requireCommitArg(value: string): string {
  if (!COMMIT_OID.test(value)) {
    throw new Error(`Invalid commit: ${value}`)
  }
  return value
}

function mainlineArgs(mainline: number | undefined): string[] {
  if (mainline === undefined) {
    return []
  }
  if (!Number.isInteger(mainline) || mainline < 1) {
    throw new Error(`Invalid mainline: ${mainline}`)
  }
  return ['-m', String(mainline)]
}

async function localBranchExists(
  git: GitHistoryExecutor,
  cwd: string,
  name: string
): Promise<boolean> {
  try {
    await git(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], cwd)
    return true
  } catch {
    return false
  }
}

async function gitGraphActionArgs(
  git: GitHistoryExecutor,
  cwd: string,
  action: GitGraphAction
): Promise<string[]> {
  switch (action.kind) {
    case 'checkout':
      // Trailing `--` keeps a branch named like a file from being read as a pathspec.
      return ['checkout', requireRefArg(action.ref, 'ref'), '--']
    case 'checkoutRemoteBranch': {
      const localName = requireRefArg(action.localName, 'branch name')
      if (await localBranchExists(git, cwd, localName)) {
        return ['checkout', localName, '--']
      }
      return [
        'checkout',
        '-b',
        localName,
        '--track',
        requireRefArg(action.remoteBranch, 'remote branch')
      ]
    }
    case 'createBranch': {
      const name = requireRefArg(action.name, 'branch name')
      const startPoint = requireRefArg(action.startPoint, 'start point')
      return action.checkout ? ['checkout', '-b', name, startPoint] : ['branch', name, startPoint]
    }
    case 'deleteBranch':
      return ['branch', action.force ? '-D' : '-d', requireRefArg(action.name, 'branch name')]
    case 'merge':
      return ['merge', '--no-edit', requireRefArg(action.ref, 'ref')]
    case 'cherryPick':
      return ['cherry-pick', ...mainlineArgs(action.mainline), requireCommitArg(action.commit)]
    case 'revert':
      return [
        'revert',
        '--no-edit',
        ...mainlineArgs(action.mainline),
        requireCommitArg(action.commit)
      ]
    case 'reset':
      if (action.mode !== 'soft' && action.mode !== 'mixed' && action.mode !== 'hard') {
        throw new Error(`Invalid reset mode: ${String(action.mode)}`)
      }
      return ['reset', `--${action.mode}`, requireCommitArg(action.commit)]
    case 'fetch':
      return ['fetch', '--all']
  }
}

export async function runGitGraphAction(
  git: GitHistoryExecutor,
  cwd: string,
  action: GitGraphAction
): Promise<{ output: string }> {
  const { stdout, stderr } = await git(await gitGraphActionArgs(git, cwd, action), cwd)
  return { output: [stdout, stderr].filter(Boolean).join('\n').trim() }
}
