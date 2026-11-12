import { ipcMain } from 'electron'
import type { Store } from '../../persistence/loading-store/store'
import type { LocalProjectWorktreeGitOptions } from '../../workspaces/execution-host/project-runtime-git-options'
import type { GitHistoryExecutor } from '../../../shared/git/history/git-history-types'
import type {
  GitGraphActionRequest,
  GitGraphLogRequest,
  GitGraphLogResult,
  GitGraphRepoInfo,
  GitGraphRepoInfoRequest,
  GitGraphRepoSettings
} from '../../../shared/codezera/git-graph-types'
import { gitExecFileAsync } from '../../git/command-runner/git-exec-file'
import { gitOptionsForWorktree } from '../../git/command-runner/git-runtime-options'
import { readWorktreeGitUnlessWslStopped } from '../../ipc/filesystem/wsl-gated-worktree-git-read'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'
import { loadGitGraph } from './git-graph-log'
import { runGitGraphAction } from './git-graph-actions'
import { loadGitGraphRepoInfo } from './git-graph-repo-info'
import { getGitGraphRepoSettings, setGitGraphRepoSettings } from './git-graph-settings-store'

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

  ipcMain.handle(
    'codezera:gitGraph:repoInfo',
    async (_event, args: GitGraphRepoInfoRequest): Promise<GitGraphRepoInfo> => {
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      return readWorktreeGitUnlessWslStopped(store, args.worktreePath, true, (path, gitOptions) =>
        loadGitGraphRepoInfo(executorFor(gitOptions), path)
      )
    }
  )

  ipcMain.handle(
    'codezera:gitGraph:getSettings',
    (_event, repoId: string): Promise<GitGraphRepoSettings> => getGitGraphRepoSettings(repoId)
  )

  ipcMain.handle(
    'codezera:gitGraph:setSettings',
    (_event, repoId: string, settings: unknown): Promise<void> =>
      setGitGraphRepoSettings(repoId, settings)
  )
}
