import { ipcMain } from 'electron'
import type { Store } from '../../persistence/loading-store/store'
import type { CommitMessageAgentEnvironmentResolvers } from '../../text-generation/commit-message-agent-environment'
import {
  connectPms,
  connectPmsFromSkillConfig,
  disconnectPms,
  getPmsItem,
  getPmsStatus,
  listPmsItems,
  logPmsTime,
  pmsLoggedHours,
  pmsLogTimeCategories,
  pmsStatusOptions,
  setPmsItemStatus
} from './pms-service'
import { pmsQueue, pmsTicketFieldOptions, pmsUsers } from './pms-queue'
import { pmsDashboardDrill, pmsDashboardOverview, pmsDashboardReport } from './pms-dashboard'
import {
  finishPmsTicket,
  pmsTicketTasks,
  savePmsTicket,
  takePmsTicket
} from './pms-ticket-workflow'
import { createPmsTicketTask } from './pms-linked-task'
import { pmsReportPreview, submitPmsReport } from './pms-reports'
import { cancelWritePmsReport, writePmsReport } from './pms-report-ai'

export function registerCodezeraPmsHandlers(
  store: Store,
  agentEnv: CommitMessageAgentEnvironmentResolvers | undefined
): void {
  ipcMain.handle('codezera:pms:getStatus', () => getPmsStatus())
  ipcMain.handle('codezera:pms:connect', (_event, input: unknown) => connectPms(input))
  ipcMain.handle('codezera:pms:connectFromSkillConfig', () => connectPmsFromSkillConfig())
  ipcMain.handle('codezera:pms:disconnect', () => disconnectPms())
  ipcMain.handle('codezera:pms:list', (_event, args: unknown) => listPmsItems(args))
  ipcMain.handle('codezera:pms:queue', (_event, args: unknown) => pmsQueue(args))
  ipcMain.handle('codezera:pms:dashboardOverview', (_event, filters: unknown) =>
    pmsDashboardOverview(filters)
  )
  ipcMain.handle('codezera:pms:dashboardReport', (_event, args: unknown) =>
    pmsDashboardReport(args)
  )
  ipcMain.handle('codezera:pms:dashboardDrill', (_event, args: unknown) => pmsDashboardDrill(args))
  ipcMain.handle('codezera:pms:getItem', (_event, args: unknown) => getPmsItem(args))
  ipcMain.handle('codezera:pms:statusOptions', (_event, kind: unknown) => pmsStatusOptions(kind))
  ipcMain.handle('codezera:pms:logTimeCategories', () => pmsLogTimeCategories())
  ipcMain.handle('codezera:pms:setStatus', (_event, args: unknown) => setPmsItemStatus(args))
  ipcMain.handle('codezera:pms:saveTicket', (_event, args: unknown) => savePmsTicket(args))
  ipcMain.handle('codezera:pms:takeTicket', (_event, args: unknown) => takePmsTicket(args))
  ipcMain.handle('codezera:pms:finishTicket', (_event, args: unknown) => finishPmsTicket(args))
  ipcMain.handle('codezera:pms:ticketTasks', (_event, id: unknown) => pmsTicketTasks(id))
  ipcMain.handle('codezera:pms:createTicketTask', (_event, args: unknown) =>
    createPmsTicketTask(args)
  )
  ipcMain.handle('codezera:pms:users', () => pmsUsers())
  ipcMain.handle('codezera:pms:ticketFieldOptions', (_event, field: unknown) =>
    pmsTicketFieldOptions(field)
  )
  ipcMain.handle('codezera:pms:logTime', (_event, args: unknown) => logPmsTime(args))
  ipcMain.handle('codezera:pms:loggedHours', (_event, date: unknown) => pmsLoggedHours(date))
  ipcMain.handle('codezera:pms:reportPreview', (_event, args: unknown) => pmsReportPreview(args))
  ipcMain.handle('codezera:pms:submitReport', (_event, args: unknown) => submitPmsReport(args))
  ipcMain.handle('codezera:pms:writeReport', (_event, args: unknown) =>
    writePmsReport(store, agentEnv, args)
  )
  ipcMain.handle('codezera:pms:cancelWriteReport', () => cancelWritePmsReport())
}
