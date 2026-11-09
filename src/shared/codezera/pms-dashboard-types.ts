import type { PmsStatusOption } from './pms-types'

export type PmsQueueRole = 'all' | 'processing' | 'verification' | 'reception' | 'owner'
export type PmsQueueLayout = 'eisenhower' | 'list' | 'project'
export type PmsQuadrant = 'do_now' | 'plan' | 'delegate' | 'limit'

/** One open ticket as the PMS Ticket Dashboard ranks it. */
export type PmsQueueRow = {
  id: string
  number: string
  title: string
  status: string
  priority: string
  category: string
  roles: string[]
  /** Fields the next step still needs, as the dashboard names them. */
  missing: string[]
  /** YYYY-MM-DD or empty. */
  due: string
  late: boolean
  lateDays: number
  soon: boolean
  stale: boolean
  ageDays: number
  project: string
  /** Mức độ quan trọng = Quan trọng. */
  important: boolean
  /** Người tiếp nhận / xử lý names, empty when unset. */
  receptionName: string
  processingName: string
}

export type PmsQueueBucket = { key: string; total: number; late: number; rows: PmsQueueRow[] }

/** The Ticket Dashboard filters every section (overview, detail, report) runs under. */
export type PmsDashboardFilters = {
  role: PmsQueueRole
  /** An employee id, or empty for every employee; the user's own when absent. */
  user?: string
  /** Company name; empty for every company. */
  company: string
  /** `helpdesk_project_type` value; empty for every type. */
  projectType: string
  /** Project name or `PMS_NO_PROJECT`; empty for every project. */
  project: string
}

/** Tickets without a project, as the dashboard keys them in filters and groups. */
export const PMS_NO_PROJECT = '__none__'

/** The filters PMS applied and the choices left under them. */
export type PmsDashboardScope = {
  /** PMS drops a filter value without tickets left; these are the ones it kept. */
  company: string
  projectType: string
  project: string
  companies: string[]
  projectTypes: PmsStatusOption[]
  projects: string[]
  /** Whether PMS let the user pick another employee (Ticket Dashboard managers only). */
  canViewOthers: boolean
}

export type PmsQueueArgs = {
  filters: PmsDashboardFilters
  layout: PmsQueueLayout
  keyword: string
  status: string
  /** 1-based page of the list/project layouts. */
  page: number
  quadrantPages: Partial<Record<PmsQuadrant, number>>
}

export type PmsQueue = {
  layout: PmsQueueLayout
  scope: PmsDashboardScope
  statuses: string[]
  total: number
  /** Eisenhower quadrants or project groups; the list layout is one bucket keyed `all`. */
  buckets: PmsQueueBucket[]
  page: number
  pageCount: number
  /** Rows per quadrant page / list page, for paging. */
  pageSize: number
}

/** Overview KPI columns: open to-do, overdue, due soon, idle, missing fields, waiting for the customer, on hold. */
export type PmsDashboardMetric =
  | 'all'
  | 'late'
  | 'soon'
  | 'stale'
  | 'missing'
  | 'waitcus'
  | 'parked'
export type PmsDashboardCounts = Record<PmsDashboardMetric, number>

export type PmsDashboardOverview = {
  scope: PmsDashboardScope
  kpis: PmsDashboardCounts
  /** Open statuses in workflow order. */
  pipeline: { status: string; count: number; medianDays: number; stale: number }[]
  /** `ticketcategories` values, busiest first. */
  categories: { category: string; label: string; count: number }[]
  /** Per employee; PMS fills it only for a manager's team view. */
  byUser: { key: string; label: string; counts: PmsDashboardCounts }[]
  byProject: { key: string; label: string; counts: PmsDashboardCounts }[]
}

export type PmsDashboardPeriod = 'week' | 'month' | 'quarter' | 'year'
export type PmsDashboardReportGroup = 'person' | 'project' | 'category'

export type PmsDashboardReportRow = {
  key: string
  label: string
  /** Tickets created in the period and where they stand now. */
  created: number
  done: number
  open: number
  overdue: number
  /** Tickets completed in the period, and in the same span of the period before. */
  completed: number
  previousCompleted: number
}

export type PmsDashboardReportArgs = {
  filters: PmsDashboardFilters
  period: PmsDashboardPeriod
  /** A bucket key (2026-Q4, 2026-10, 2026-W42, 2026); empty for the current one. */
  picked: string
}

export type PmsDashboardReport = {
  scope: PmsDashboardScope
  period: PmsDashboardPeriod
  /** Shown periods, oldest first, ending with the current one. */
  buckets: string[]
  picked: string
  previous: string
  /** For the running period, the previous one only counts up to this time (same span). */
  cutoff: string
  created: number
  previousCreated: number
  open: number
  overdue: number
  completed: number
  previousCompleted: number
  trend: { bucket: string; created: number; completed: number }[]
  groups: Record<PmsDashboardReportGroup, PmsDashboardReportRow[]>
  /** The user's rank by completions in the team, when the filters pick the user. */
  standing: { rank: number; total: number; behind: number } | null
}

/** The tickets behind one count of the report. */
export type PmsDashboardDrillArgs = {
  filters: PmsDashboardFilters
  source: 'created' | 'completed'
  bucket: string
  /** Same-span cutoff of a previous period; empty for the whole period. */
  until: string
  /** Created tickets only: where they stand now; empty for all. */
  state: '' | 'done' | 'open' | 'overdue'
  group: PmsDashboardReportGroup | ''
  key: string
  page: number
}

export type PmsDashboardDrill = {
  rows: { id: string; number: string; title: string; status: string; project: string }[]
  total: number
  page: number
  pageSize: number
}
