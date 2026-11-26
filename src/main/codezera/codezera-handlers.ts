import type { Store } from '../persistence/loading-store/store'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/execution/commit-message-agent-environment'
import { registerCodezeraGitGraphHandlers } from './git-graph/git-graph-handlers'
import { registerCodezeraOrcaImportHandlers } from './orca-import/orca-import-handlers'
import { registerCodezeraCkitHandlers } from './ckit/ckit-handlers'
import { registerCodezeraSnippetsHandlers } from './snippets/snippets-handlers'
import { registerCodezeraSftpHandlers } from './sftp/sftp-handlers'
import { registerCodezeraPmsHandlers } from './pms/pms-handlers'

let registered = false

/**
 * Single hook into Orca's registerCoreHandlers, so new Codezera IPC never touches Orca files.
 * Runs on every main window, but `ipcMain.handle` throws on a second handler: like Orca's own
 * IPC, register once per process (macOS reopens the window without restarting the app).
 */
export function registerCodezeraHandlers(
  store: Store,
  agentEnv?: CommitMessageAgentEnvironmentResolvers
): void {
  if (registered) {
    return
  }
  registered = true
  registerCodezeraGitGraphHandlers(store)
  registerCodezeraOrcaImportHandlers()
  registerCodezeraCkitHandlers()
  registerCodezeraSnippetsHandlers()
  registerCodezeraSftpHandlers(store)
  registerCodezeraPmsHandlers(store, agentEnv)
}
