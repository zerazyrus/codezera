import { z } from 'zod'
import type { PmsStatusOption } from '../../../shared/codezera/pms-types'
import type {
  PmsDashboardCounts,
  PmsDashboardDrill,
  PmsDashboardMetric,
  PmsDashboardOverview,
  PmsDashboardReport,
  PmsDashboardReportGroup,
  PmsDashboardReportRow
} from '../../../shared/codezera/pms-dashboard-types'
import { DashboardFiltersSchema, dashboardAction, dashboardScope } from './pms-dashboard-scope'
import { pmsUsers } from './pms-queue'
import { pmsField, pmsRecord as record } from './pms-records'
import { connectedClient, picklist } from './pms-service'

// Drilldown page size (HelpDesk_TicketDashboardDetail_Model::PAGE_SIZE).
const DRILL_PAGE_SIZE = 20

const ReportArgsSchema = z.object({
  filters: DashboardFiltersSchema,
  period: z.enum(['week', 'month', 'quarter', 'year']),
  picked: z.string().max(20)
})

const DrillArgsSchema = z.object({
  filters: DashboardFiltersSchema,
  source: z.enum(['created', 'completed']),
  bucket: z.string().min(1).max(20),
  until: z.string().max(40),
  state: z.enum(['', 'done', 'open', 'overdue']),
  group: z.enum(['', 'person', 'project', 'category']),
  key: z.string().max(300),
  page: z.number().int().min(1)
})

function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function counts(value: unknown): PmsDashboardCounts {
  const raw = record(value)
  const count = (metric: PmsDashboardMetric): number => Number(raw[metric]) || 0
  return {
    all: count('all'),
    late: count('late'),
    soon: count('soon'),
    stale: count('stale'),
    missing: count('missing'),
    waitcus: count('waitcus'),
    parked: count('parked')
  }
}

function labelOf(options: PmsStatusOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value
}

async function userNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map()
  }
  return new Map((await pmsUsers()).map((user) => [user.id, user.name]))
}

/** Ticket Dashboard "Tổng quan": KPI cards, status pipeline, categories, per employee and per project. */
export async function pmsDashboardOverview(input: unknown): Promise<PmsDashboardOverview> {
  const filters = DashboardFiltersSchema.parse(input)
  const pms = await connectedClient()
  const result = await dashboardAction(pms, 'getData', filters, { sections: ['overview'] })
  const overview = record(result.overview)
  const groups = record(overview.groups)
  const groupRows = (key: string): { key: string; counts: PmsDashboardCounts }[] =>
    rows(record(groups[key]).rows).map((row) => ({
      key: pmsField(record(row), 'key'),
      counts: counts(record(row).counts)
    }))
  const userRows = groupRows('user')
  const [names, categoryLabels, scope] = await Promise.all([
    userNames(userRows.map((row) => row.key)),
    picklist('HelpDesk', 'ticketcategories').catch(() => []),
    dashboardScope(result)
  ])
  return {
    scope,
    kpis: counts(overview.kpis),
    pipeline: Object.entries(record(overview.pipeline)).map(([status, lane]) => ({
      status,
      count: Number(record(lane).count) || 0,
      medianDays: Number(record(lane).median) || 0,
      stale: Number(record(lane).stale) || 0
    })),
    categories: rows(overview.categories).map((entry) => {
      const [category, count] = rows(entry)
      return {
        category: String(category ?? ''),
        label: labelOf(categoryLabels, String(category ?? '')),
        count: Number(count) || 0
      }
    }),
    byUser: userRows.map((row) => ({ ...row, label: names.get(row.key) ?? row.key })),
    byProject: groupRows('project').map((row) => ({ ...row, label: row.key }))
  }
}

/** Ticket Dashboard "Báo cáo": tickets created and completed per period, per employee/project/category. */
export async function pmsDashboardReport(input: unknown): Promise<PmsDashboardReport> {
  const args = ReportArgsSchema.parse(input)
  const pms = await connectedClient()
  // A report-only request skips the open tickets, so PMS returns no filter choices; overview brings them.
  const result = await dashboardAction(pms, 'getData', args.filters, {
    sections: ['overview', 'report'],
    report: { period: args.period, picked: args.picked }
  })
  const report = record(result.report)
  if (!report.inflow || !report.completed) {
    throw new Error('PMS could not compute the ticket report; try again in a moment.')
  }
  const inflow = record(report.inflow)
  const completed = record(report.completed)
  const inflowSummary = record(inflow.summary)
  const completedSummary = record(completed.summary)
  const people = { ...record(completed.people), ...record(inflow.people) }
  const [categoryLabels, scope] = await Promise.all([
    picklist('HelpDesk', 'ticketcategories').catch(() => []),
    dashboardScope(result)
  ])

  const groupRows = (group: PmsDashboardReportGroup): PmsDashboardReportRow[] => {
    const created = record(record(inflow.groups)[group])
    const done = record(record(completed.groups)[group])
    const keys = [...new Set([...Object.keys(created), ...Object.keys(done)])]
    return keys
      .map((key) => {
        const a = record(created[key])
        const b = record(done[key])
        return {
          key,
          label:
            group === 'person'
              ? pmsField(record(people[key]), 'name') || key
              : group === 'category'
                ? labelOf(categoryLabels, key)
                : key,
          created: Number(a.created) || 0,
          done: Number(a.done) || 0,
          open: Number(a.open) || 0,
          overdue: Number(a.overdue) || 0,
          completed: Number(b.completed) || 0,
          previousCompleted: Number(b.previous) || 0
        }
      })
      .sort((x, y) => y.completed - x.completed || y.created - x.created)
  }

  const buckets = rows(inflow.buckets).map(String)
  const inflowTrend = record(inflow.trend)
  const completedTrend = record(completed.trend)
  const standing = rows(completed.standing).map((entry) => {
    const [id, count] = rows(entry)
    return { id: String(id), count: Number(count) || 0 }
  })
  const myIndex = standing.findIndex((entry) => entry.id === pms.user?.id)

  return {
    scope,
    period: args.period,
    buckets,
    picked: pmsField(inflow, 'picked'),
    previous: pmsField(inflow, 'previous'),
    cutoff: pmsField(inflow, 'cutoff'),
    created: Number(inflowSummary.created) || 0,
    previousCreated: Number(inflowSummary.previous_created) || 0,
    open: Number(inflowSummary.open) || 0,
    overdue: Number(inflowSummary.overdue) || 0,
    completed: Number(completedSummary.completed) || 0,
    previousCompleted: Number(completedSummary.previous_completed) || 0,
    trend: buckets.map((bucket) => ({
      bucket,
      created: Number(inflowTrend[bucket]) || 0,
      completed: Number(completedTrend[bucket]) || 0
    })),
    groups: {
      person: groupRows('person'),
      project: groupRows('project'),
      category: groupRows('category')
    },
    standing:
      myIndex === -1
        ? null
        : {
            rank: myIndex + 1,
            total: standing.length,
            behind: myIndex === 0 ? 0 : standing[myIndex - 1].count - standing[myIndex].count
          }
  }
}

/** The tickets behind one count of the report, newest first. */
export async function pmsDashboardDrill(input: unknown): Promise<PmsDashboardDrill> {
  const args = DrillArgsSchema.parse(input)
  const pms = await connectedClient()
  const result = await dashboardAction(
    pms,
    args.source === 'created' ? 'getInflowTickets' : 'getCompletedTickets',
    args.filters,
    {
      drill: {
        bucket: args.bucket,
        until: args.until,
        state: args.state,
        group: args.group,
        key: args.key,
        page: args.page
      }
    }
  )
  return {
    rows: rows(result.tickets).map((entry) => {
      const ticket = record(entry)
      return {
        id: pmsField(ticket, 'id'),
        number: pmsField(ticket, 'ticket_no'),
        title: pmsField(ticket, 'title') || pmsField(ticket, 'ticket_title'),
        status: pmsField(ticket, 'status') || pmsField(ticket, 'ticketstatus'),
        project: pmsField(ticket, 'project')
      }
    }),
    total: Number(result.total) || 0,
    page: Number(result.page) || 1,
    pageSize: DRILL_PAGE_SIZE
  }
}
