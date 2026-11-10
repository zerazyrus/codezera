import { ipcMain } from 'electron'
import type { Store } from '../../persistence/loading-store/store'
import type { CommitMessageAgentEnvironmentResolvers } from '../../text-generation/commit-message-agent-environment'
import { connectPms, connectPmsFromSkillConfig, disconnectPms } from './pms-service'
import { pmsDashboardDrill, pmsDashboardOverview, pmsDashboardReport } from './pms-dashboard'
import { cancelWritePmsReport, writePmsReport } from './pms-report-ai'
import { PMS_AGENT_ACTIONS, runPmsAgentAction } from './pms-agent-actions'
import { setPmsAgentDispatcher } from './pms-rpc-methods'

export function registerCodezeraPmsHandlers(
  store: Store,
  agentEnv: CommitMessageAgentEnvironmentResolvers | undefined
): void {
  for (const [action, run] of Object.entries(PMS_AGENT_ACTIONS)) {
    ipcMain.handle(`codezera:pms:${action}`, (_event, args: unknown) => run(args))
  }
  setPmsAgentDispatcher(runPmsAgentAction)
  ipcMain.handle('codezera:pms:connect', (_event, input: unknown) => connectPms(input))
  ipcMain.handle('codezera:pms:connectFromSkillConfig', () => connectPmsFromSkillConfig())
  ipcMain.handle('codezera:pms:disconnect', () => disconnectPms())
  ipcMain.handle('codezera:pms:dashboardOverview', (_event, filters: unknown) =>
    pmsDashboardOverview(filters)
  )
  ipcMain.handle('codezera:pms:dashboardReport', (_event, args: unknown) =>
    pmsDashboardReport(args)
  )
  ipcMain.handle('codezera:pms:dashboardDrill', (_event, args: unknown) => pmsDashboardDrill(args))
  ipcMain.handle('codezera:pms:writeReport', (_event, args: unknown) =>
    writePmsReport(store, agentEnv, args)
  )
  ipcMain.handle('codezera:pms:cancelWriteReport', () => cancelWritePmsReport())
}
