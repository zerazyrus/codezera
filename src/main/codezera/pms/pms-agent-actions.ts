import {
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
import {
  finishPmsTicket,
  pmsTicketTasks,
  savePmsTicket,
  takePmsTicket
} from './pms-ticket-workflow'
import { createPmsTicketTask } from './pms-linked-task'
import { pmsReportPreview, submitPmsReport } from './pms-reports'
import { addPmsComment, pmsComments } from './pms-comments'
import { downloadPmsTicketImages } from './pms-attachments'

/**
 * PMS work shared by the app's IPC and the `orca pms` CLI that agents run; account changes and the
 * dashboard stay UI-only. Every action validates its own input.
 */
export const PMS_AGENT_ACTIONS: Record<string, (args: unknown) => Promise<unknown>> = {
  getStatus: () => getPmsStatus(),
  list: listPmsItems,
  queue: pmsQueue,
  getItem: getPmsItem,
  statusOptions: pmsStatusOptions,
  logTimeCategories: () => pmsLogTimeCategories(),
  setStatus: setPmsItemStatus,
  saveTicket: savePmsTicket,
  takeTicket: takePmsTicket,
  finishTicket: finishPmsTicket,
  ticketTasks: pmsTicketTasks,
  createTicketTask: createPmsTicketTask,
  users: () => pmsUsers(),
  ticketFieldOptions: pmsTicketFieldOptions,
  logTime: logPmsTime,
  loggedHours: pmsLoggedHours,
  reportPreview: pmsReportPreview,
  submitReport: submitPmsReport,
  comments: pmsComments,
  addComment: addPmsComment,
  downloadImages: downloadPmsTicketImages
}

export function runPmsAgentAction(action: string, args: unknown): Promise<unknown> {
  const run = Object.hasOwn(PMS_AGENT_ACTIONS, action) ? PMS_AGENT_ACTIONS[action] : undefined
  if (!run) {
    throw new Error(`Unknown PMS action: ${action}`)
  }
  return run(args)
}
