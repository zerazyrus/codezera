import type { Store } from '../persistence/loading-store/store'
import { registerCodezeraGitGraphHandlers } from './git-graph/git-graph-handlers'
import { registerCodezeraOrcaImportHandlers } from './orca-import/orca-import-handlers'
import { registerCodezeraCkitHandlers } from './ckit/ckit-handlers'
import { registerCodezeraSnippetsHandlers } from './snippets/snippets-handlers'
import { registerCodezeraSftpHandlers } from './sftp/sftp-handlers'

/** Single hook into Orca's registerCoreHandlers, so new Codezera IPC never touches Orca files. */
export function registerCodezeraHandlers(store: Store): void {
  registerCodezeraGitGraphHandlers(store)
  registerCodezeraOrcaImportHandlers()
  registerCodezeraCkitHandlers()
  registerCodezeraSnippetsHandlers()
  registerCodezeraSftpHandlers(store)
}
