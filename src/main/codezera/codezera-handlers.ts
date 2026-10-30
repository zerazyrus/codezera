import type { Store } from '../persistence'
import { registerCodezeraGitGraphHandlers } from './git-graph/git-graph-handlers'
import { registerCodezeraOrcaImportHandlers } from './orca-import/orca-import-handlers'

/** Single hook into Orca's registerCoreHandlers, so new Codezera IPC never touches Orca files. */
export function registerCodezeraHandlers(store: Store): void {
  registerCodezeraGitGraphHandlers(store)
  registerCodezeraOrcaImportHandlers()
}
