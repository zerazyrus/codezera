import { ipcMain } from 'electron'
import type { Store } from '../../persistence'
import type { LocalProjectWorktreeGitOptions } from '../../project-runtime-git-options'
import type { GitHistoryExecutor } from '../../../shared/git-history-types'
import type {
  GitGraphActionRequest,
  GitGraphLogRequest,
  GitGraphLogResult
} from '../../../shared/codezera/git-graph-types'
import { gitExecFileAsync } from '../../git/runner'
import { gitOptionsForWorktree } from '../../git/git-runtime-options'
import { readWorktreeGitUnlessWslStopped } from '../../ipc/filesystem/wsl-gated-worktree-git-read'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'
import { loadGitGraph } from './git-graph-log'
import { runGitGraphAction } from './git-graph-actions'

function executorFor(gitOptions: LocalProjectWorktreeGitOptions): GitHistoryExecutor {
  return (args, cwd) => gitExecFileAsync(args, gitOptionsForWorktree(cwd, gitOptions))
}

/** Local and WSL worktrees only, matching `git:history`; remote hosts reject in `requireReachableGitRoute`. */
export function registerCodezeraGitGraphHandlers(store: Store): void {
  ipcMain.handle(
    'codezera:gitGraph:log',
    async (_event, args: GitGraphLogRequest): Promise<GitGraphLogResult> => {
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      return readWorktreeGitUnlessWslStopped(
        store,
        args.worktreePath,
        args.wakeWslDistro,
        (path, gitOptions) => loadGitGraph(executorFor(gitOptions), path, args)
      )
    }
  )

  ipcMain.handle(
    'codezera:gitGraph:action',
    async (_event, args: GitGraphActionRequest): Promise<{ output: string }> => {
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      return readWorktreeGitUnlessWslStopped(store, args.worktreePath, true, (path, gitOptions) =>
        runGitGraphAction(executorFor(gitOptions), path, args.action)
      )
    }
  )
}
