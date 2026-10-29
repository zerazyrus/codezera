import type { GitHistoryExecutor } from '../../../shared/git-history-types'
import type { GitGraphAction, GitGraphConfigScope } from '../../../shared/codezera/git-graph-types'

const COMMIT_OID = /^[0-9a-f]{7,64}$/i
const STASH_SELECTOR = /^stash@\{\d+\}$/

/** Renderer input becomes git argv: refuse anything git could read as an option; git rejects the rest of bad ref names. */
export function requireRefArg(value: string, label: string): string {
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

function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

function requireUrlArg(value: string): string {
  if (
    !value ||
    value.startsWith('-') ||
    value.length > 2048 ||
    /\s/.test(value) ||
    hasControlChar(value)
  ) {
    throw new Error(`Invalid remote URL: ${value}`)
  }
  return value
}

/** user.name / user.email values: one line, never option-like. */
function requireConfigValue(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('-') || trimmed.length > 256 || hasControlChar(trimmed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return trimmed
}

function scopeFlag(scope: GitGraphConfigScope): string {
  if (scope !== 'local' && scope !== 'global') {
    throw new Error(`Invalid config scope: ${String(scope)}`)
  }
  return `--${scope}`
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

type GitCommand = { args: string[]; allowFail?: boolean }

async function gitGraphActionCommands(
  git: GitHistoryExecutor,
  cwd: string,
  action: GitGraphAction
): Promise<GitCommand[]> {
  switch (action.kind) {
    case 'checkout':
      // Trailing `--` keeps a branch named like a file from being read as a pathspec.
      return [{ args: ['checkout', requireRefArg(action.ref, 'ref'), '--'] }]
    case 'checkoutRemoteBranch': {
      const localName = requireRefArg(action.localName, 'branch name')
      if (await localBranchExists(git, cwd, localName)) {
        return [{ args: ['checkout', localName, '--'] }]
      }
      return [
        {
          args: [
            'checkout',
            '-b',
            localName,
            '--track',
            requireRefArg(action.remoteBranch, 'remote branch')
          ]
        }
      ]
    }
    case 'createBranch': {
      const name = requireRefArg(action.name, 'branch name')
      const startPoint = requireRefArg(action.startPoint, 'start point')
      return [
        {
          args: action.checkout
            ? ['checkout', '-b', name, startPoint]
            : ['branch', name, startPoint]
        }
      ]
    }
    case 'deleteBranch':
      return [
        { args: ['branch', action.force ? '-D' : '-d', requireRefArg(action.name, 'branch name')] }
      ]
    case 'merge':
      return [{ args: ['merge', '--no-edit', requireRefArg(action.ref, 'ref')] }]
    case 'cherryPick':
      return [
        {
          args: ['cherry-pick', ...mainlineArgs(action.mainline), requireCommitArg(action.commit)]
        }
      ]
    case 'revert':
      return [
        {
          args: [
            'revert',
            '--no-edit',
            ...mainlineArgs(action.mainline),
            requireCommitArg(action.commit)
          ]
        }
      ]
    case 'reset':
      if (action.mode !== 'soft' && action.mode !== 'mixed' && action.mode !== 'hard') {
        throw new Error(`Invalid reset mode: ${String(action.mode)}`)
      }
      return [{ args: ['reset', `--${action.mode}`, requireCommitArg(action.commit)] }]
    case 'fetch':
      return [{ args: ['fetch', '--all'] }]
    case 'stash': {
      if (!STASH_SELECTOR.test(action.selector)) {
        throw new Error(`Invalid stash: ${action.selector}`)
      }
      if (
        action.operation !== 'apply' &&
        action.operation !== 'pop' &&
        action.operation !== 'drop'
      ) {
        throw new Error(`Invalid stash operation: ${String(action.operation)}`)
      }
      return [{ args: ['stash', action.operation, action.selector] }]
    }
    case 'setUser': {
      const flag = scopeFlag(action.scope)
      return [
        { args: ['config', flag, 'user.name', requireConfigValue(action.name, 'user name')] },
        { args: ['config', flag, 'user.email', requireConfigValue(action.email, 'user email')] }
      ]
    }
    case 'unsetUser': {
      const flag = scopeFlag(action.scope)
      // Exit 5 means the key was never set in that scope; nothing to remove.
      return [
        { args: ['config', flag, '--unset-all', 'user.name'], allowFail: true },
        { args: ['config', flag, '--unset-all', 'user.email'], allowFail: true }
      ]
    }
    case 'addRemote': {
      const name = requireRefArg(action.name, 'remote name')
      const commands: GitCommand[] = [
        { args: ['remote', 'add', name, requireUrlArg(action.fetchUrl)] }
      ]
      if (action.pushUrl && action.pushUrl !== action.fetchUrl) {
        commands.push({
          args: ['remote', 'set-url', '--push', name, requireUrlArg(action.pushUrl)]
        })
      }
      return commands
    }
    case 'editRemote': {
      const name = requireRefArg(action.name, 'remote name')
      const newName = requireRefArg(action.newName, 'remote name')
      const commands: GitCommand[] = []
      if (newName !== name) {
        commands.push({ args: ['remote', 'rename', name, newName] })
      }
      commands.push({ args: ['remote', 'set-url', newName, requireUrlArg(action.fetchUrl)] })
      commands.push({
        args: [
          'remote',
          'set-url',
          '--push',
          newName,
          requireUrlArg(action.pushUrl || action.fetchUrl)
        ]
      })
      return commands
    }
    case 'deleteRemote':
      return [{ args: ['remote', 'remove', requireRefArg(action.name, 'remote name')] }]
    case 'fetchRemote':
      return [
        {
          args: [
            'fetch',
            ...(action.prune ? ['--prune'] : []),
            requireRefArg(action.name, 'remote name')
          ]
        }
      ]
    case 'pruneRemote':
      return [{ args: ['remote', 'prune', requireRefArg(action.name, 'remote name')] }]
  }
}

export async function runGitGraphAction(
  git: GitHistoryExecutor,
  cwd: string,
  action: GitGraphAction
): Promise<{ output: string }> {
  const output: string[] = []
  for (const command of await gitGraphActionCommands(git, cwd, action)) {
    try {
      const { stdout, stderr } = await git(command.args, cwd)
      output.push(stdout, stderr ?? '')
    } catch (error) {
      if (!command.allowFail) {
        throw error
      }
    }
  }
  return { output: output.filter(Boolean).join('\n').trim() }
}
