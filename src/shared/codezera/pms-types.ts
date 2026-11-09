import type { TextGenerationFailureFields } from '../text-generation-failure-copy'
import type {
  PmsDashboardDrill,
  PmsDashboardDrillArgs,
  PmsDashboardFilters,
  PmsDashboardOverview,
  PmsDashboardReport,
  PmsDashboardReportArgs,
  PmsQueue,
  PmsQueueArgs
} from './pms-dashboard-types'

/** CloudGO PMS work item kinds: HelpDesk tickets and ProjectTask tasks. */
export type PmsItemKind = 'ticket' | 'task'

export type PmsAccountInput = {
  baseUrl: string
  username: string
  /** Login password; the CloudWORK app API authenticates with it. */
  password: string
  /** OpenAPI access key from the PMS user profile; used for picklists and timesheets. */
  accessKey: string
}

export type PmsStatus =
  | { state: 'not-configured'; skillConfigFound: boolean }
  | { state: 'connected'; baseUrl: string; username: string; userId: string; userName: string }
  | { state: 'error'; baseUrl: string; username: string; message: string }

export type PmsStatusOption = { value: string; label: string; color: string | null }

export type PmsItem = {
  kind: PmsItemKind
  id: string
  /** `#27383` for tickets, `PT28073` for tasks; list rows of tasks carry none. */
  number: string
  title: string
  status: string
  priority: string
  projectId: string | null
  projectLabel: string | null
  /** Hours logged on the record so far. */
  hours: number
  url: string
}

export type PmsDetailSectionKey = 'description' | 'steps' | 'expected' | 'actual' | 'solution'

/** Ticket statuses grouped by workflow phase, in order (pms2019 `HelpDesk_TicketForm_Model::STATUS_PHASES`). */
export const PMS_TICKET_STATUS_PHASES = {
  reception: ['Open', 'Wait For Verifying', 'Assigned', 'Reopen'],
  processing: ['In Progress', 'Wait For Response', 'Pending', 'Follow Up'],
  testing: ['Testing', 'Pending Golive'],
  closing: ['Wait Close', 'Closed', 'Cancel', 'Reject']
} as const satisfies Record<string, readonly string[]>
export type PmsTicketPhase = keyof typeof PMS_TICKET_STATUS_PHASES

/** Ticket fields the detail drawer edits in place, as the PMS status modal (QuickEdit) does. */
export const PMS_TICKET_EDIT_FIELDS = [
  'ticketcategories',
  'ticket_title',
  'helpdesk_project_type',
  'helpdesk_subcategory',
  'ticketpriorities',
  'importance_level',
  'ticketseverities',
  'helpdesk_bug_type',
  'helpdesk_customer_group',
  'expected_date'
] as const
export type PmsTicketEditField = (typeof PMS_TICKET_EDIT_FIELDS)[number]

/** One status of the ticket's workflow trail (PMS `progress_data`). */
export type PmsStatusStep = {
  state: 'finished' | 'in_progress' | 'not_yet'
  by: string
  /** `dd-mm-yyyy hh:mm:ss`, as PMS formats it. */
  at: string
}

export type PmsTicketExtras = {
  values: Record<PmsTicketEditField, string>
  /** Picklist options of the editable picklist fields, with PMS colors. */
  options: Partial<Record<PmsTicketEditField, PmsStatusOption[]>>
  install: string | null
  account: string | null
  contact: string | null
  source: string
  reception: string | null
  verification: string | null
  processing: string | null
  followers: string[]
  images: { name: string; url: string }[]
  steps: Record<string, PmsStatusStep>
}

export type PmsItemDetail = PmsItem & {
  /** Non-empty plain-text sections, in reading order. */
  sections: { key: PmsDetailSectionKey; text: string }[]
  category: string
  createdTime: string
  /** Statuses PMS offers from the current one (tickets) or the full picklist (tasks). */
  nextStatuses: PmsStatusOption[]
  /** Null for tasks. */
  ticket: PmsTicketExtras | null
}

export type PmsListArgs = {
  kind: PmsItemKind
  /** Null lists every status. */
  status: string | null
  search: string
  offset: number
  /** An employee id, or `all` for everyone; the user's own when absent. */
  ownerId?: string
}

export type PmsListResult = { items: PmsItem[]; total: number; nextOffset: number | null }

export type PmsLogTimeArgs = {
  kind: PmsItemKind
  id: string
  hours: number
  minutes: number
  /** `cptimesheets_task` picklist value, e.g. `coding`. */
  category: string
  /** YYYY-MM-DD. */
  date: string
  description: string
}

/** How the missing-field form edits a ticket field; `reference` fields can only be set on the web. */
export type PmsFormFieldKind = 'text' | 'textarea' | 'date' | 'picklist' | 'user' | 'reference'

export type PmsFormField = {
  field: string
  label: string
  kind: PmsFormFieldKind
  /** Picklist values for `picklist` fields. */
  options?: PmsStatusOption[]
}

/** A save the status modal would refuse: the caller fills these fields and retries. */
export type PmsNeedsFields = { needs: 'fields'; fields: PmsFormField[] }

export type PmsLinkedTask = {
  id: string
  number: string
  title: string
  status: string
  hours: number
}

export type PmsTakeArgs = {
  ticketId: string
  /** Values for fields a previous attempt reported missing. */
  fields: Record<string, string>
  /** ProjectTask type when the ticket category does not map to one. */
  taskType: string | null
  /** Skip the linked ProjectTask (only move the ticket). */
  createTask: boolean
}

export type PmsTakeResult =
  | PmsNeedsFields
  | { needs: 'taskType'; options: PmsStatusOption[] }
  | { needs: null; detail: PmsItemDetail; taskId: string | null }

export type PmsCreateTaskArgs = {
  ticketId: string
  /** Empty uses the ticket title. */
  title: string
  /** Null picks the type from the ticket category, or asks. */
  taskType: string | null
}

export type PmsCreateTaskResult =
  | { needs: 'taskType'; options: PmsStatusOption[] }
  | { needs: null; taskId: string }

export type PmsTicketSaveArgs = {
  ticketId: string
  /** New status, or null to save only fields. */
  status: string | null
  fields: Record<string, string>
}

export type PmsTicketSaveResult = PmsNeedsFields | { needs: null; detail: PmsItemDetail }

export type PmsFinishArgs = {
  ticketId: string
  status: string
  cause: string
  solution: string
  gitCommit: string
  fields: Record<string, string>
}

export type PmsUser = { id: string; name: string }

export type PmsReportType = 'day' | 'week'

/** One logged record in a report period, its timesheets merged. */
export type PmsReportEntry = {
  module: 'HelpDesk' | 'ProjectTask' | 'Calendar'
  recordId: string
  name: string
  status: string
  hours: number
  projectLabel: string
  /** Timesheet descriptions, deduplicated. */
  notes: string[]
}

export type PmsReportPreview = {
  type: PmsReportType
  start: string
  end: string
  /** ISO week number of `start`. */
  week: number
  totalHours: number
  perDay: Record<string, number>
  entries: PmsReportEntry[]
  /** Reports of mine already filed for this period. */
  existing: { id: string; number: string; status: string; url: string }[]
  name: string
  /** One task per line, grouped by project; a starting point to edit or rewrite. */
  description: string
}

export type PmsReportSubmitArgs = {
  type: PmsReportType
  /** Any day of the period. */
  date: string
  name: string
  description: string
  /** Who receives it besides me (PMS user ids). */
  recipientIds: string[]
  draft: boolean
}

export type PmsReportSubmitResult = { id: string; url: string | null }

export type PmsReportWriteResult =
  | { success: true; description: string; agentLabel?: string }
  | ({ success: false; canceled?: boolean } & TextGenerationFailureFields)

export type PmsApi = {
  getStatus: () => Promise<PmsStatus>
  /** Verifies both logins before saving the credentials. */
  connect: (input: PmsAccountInput) => Promise<PmsStatus>
  /** Connects with the credentials of the `/pms` agent skill (`~/.omp/skills/pms/config.json`). */
  connectFromSkillConfig: () => Promise<PmsStatus>
  disconnect: () => Promise<PmsStatus>
  list: (args: PmsListArgs) => Promise<PmsListResult>
  /** The user's open tickets as the PMS Ticket Dashboard ranks them. */
  queue: (args: PmsQueueArgs) => Promise<PmsQueue>
  /** Ticket Dashboard "Tổng quan" under the filters. */
  dashboardOverview: (filters: PmsDashboardFilters) => Promise<PmsDashboardOverview>
  /** Ticket Dashboard "Báo cáo": new and completed tickets per period. */
  dashboardReport: (args: PmsDashboardReportArgs) => Promise<PmsDashboardReport>
  dashboardDrill: (args: PmsDashboardDrillArgs) => Promise<PmsDashboardDrill>
  getItem: (args: { kind: PmsItemKind; id: string }) => Promise<PmsItemDetail>
  /** Every status of the kind, for list filters and badges. */
  statusOptions: (kind: PmsItemKind) => Promise<PmsStatusOption[]>
  logTimeCategories: () => Promise<PmsStatusOption[]>
  /** Task status moves; tickets go through `saveTicket`. */
  setStatus: (args: { kind: PmsItemKind; id: string; status: string }) => Promise<PmsItemDetail>
  /** Saves ticket fields and/or a status move under the status-modal rules; closes linked tasks. */
  saveTicket: (args: PmsTicketSaveArgs) => Promise<PmsTicketSaveResult>
  /** In Progress + Người xử lý = me + a linked ProjectTask, like `/pms ticket take`. */
  takeTicket: (args: PmsTakeArgs) => Promise<PmsTakeResult>
  /** Cause/solution/commit + status move + linked task closed, like `/pms ticket finish`. */
  finishTicket: (args: PmsFinishArgs) => Promise<PmsTicketSaveResult>
  /** The current user's ProjectTasks linked to a ticket, newest first. */
  ticketTasks: (ticketId: string) => Promise<PmsLinkedTask[]>
  /** A new in-progress ProjectTask of mine under the ticket, like `/pms task create --ticket`. */
  createTicketTask: (args: PmsCreateTaskArgs) => Promise<PmsCreateTaskResult>
  users: () => Promise<PmsUser[]>
  /** Picklist options of a ticket field, for the missing-field form. */
  ticketFieldOptions: (field: string) => Promise<PmsStatusOption[]>
  logTime: (args: PmsLogTimeArgs) => Promise<void>
  /** Hours the user logged on `date` (YYYY-MM-DD). */
  loggedHours: (date: string) => Promise<number>
  /** Daily/weekly report data from my timesheets, like `/pms bc` and `/pms bc tuần`. */
  reportPreview: (args: { type: PmsReportType; date: string }) => Promise<PmsReportPreview>
  submitReport: (args: PmsReportSubmitArgs) => Promise<PmsReportSubmitResult>
  /** Rewrites the description in the team's style with the Source Control AI agent. */
  writeReport: (args: {
    type: PmsReportType
    date: string
    notes: string
  }) => Promise<PmsReportWriteResult>
  cancelWriteReport: () => Promise<void>
}
