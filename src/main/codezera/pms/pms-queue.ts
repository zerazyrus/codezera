import { z } from 'zod'
import type { PmsStatusOption, PmsUser } from '../../../shared/codezera/pms-types'
import type {
  PmsQueue,
  PmsQueueBucket,
  PmsQueueRow
} from '../../../shared/codezera/pms-dashboard-types'
import { DashboardFiltersSchema, dashboardAction, dashboardScope } from './pms-dashboard-scope'
import { pmsField, type PmsRecord } from './pms-records'
import { connectedClient, picklist } from './pms-service'
import { TICKET_FORM_FIELD_RULES } from './pms-ticket-rules'

const QueueArgsSchema = z.object({
  filters: DashboardFiltersSchema,
  layout: z.enum(['eisenhower', 'list', 'project']),
  keyword: z.string().max(200),
  status: z.string().max(100),
  page: z.number().int().min(1),
  quadrantPages: z.partialRecord(
    z.enum(['do_now', 'plan', 'delegate', 'limit']),
    z.number().int().min(1)
  )
})

// Dashboard page sizes (HelpDesk_TicketDashboardDetail_Model).
const DASHBOARD_PAGE_SIZE = 20
const DASHBOARD_QUADRANT_PAGE_SIZE = 5
const QUADRANTS = ['do_now', 'plan', 'delegate', 'limit']

function personName(people: PmsRecord, id: string): string {
  const person = people[id]
  return person && typeof person === 'object' ? pmsField(person as PmsRecord, 'name') : ''
}

function queueRow(row: PmsRecord, people: PmsRecord): PmsQueueRow {
  return {
    id: pmsField(row, 'id'),
    number: pmsField(row, 'no'),
    title: pmsField(row, 'ticket_title'),
    status: pmsField(row, 'ticketstatus'),
    priority: pmsField(row, 'ticketpriorities'),
    category: pmsField(row, 'ticketcategories'),
    roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
    missing: Array.isArray(row.missing) ? row.missing.map(String) : [],
    due: pmsField(row, 'due'),
    late: row.late === true,
    lateDays: Number(row.late_days) || 0,
    soon: row.soon === true,
    stale: row.stale === true,
    ageDays: Number(row.age_days) || 0,
    project: pmsField(row, 'project'),
    important: pmsField(row, 'importance_level') === 'important',
    receptionName: personName(people, pmsField(row, 'reception_user_id')),
    processingName: personName(people, pmsField(row, 'processing_user_id'))
  }
}

function bucket(key: string, raw: PmsRecord, people: PmsRecord): PmsQueueBucket {
  const rows = Array.isArray(raw.rows) ? (raw.rows as PmsRecord[]) : []
  return {
    key,
    total: Number(raw.total) || rows.length,
    late: Number(raw.late) || 0,
    rows: rows.map((row) => queueRow(row, people))
  }
}

/** The Ticket Dashboard `detail` section, the queue PMS users work from every day. */
export async function pmsQueue(input: unknown): Promise<PmsQueue> {
  const args = QueueArgsSchema.parse(input)
  const pms = await connectedClient()
  const result = await dashboardAction(pms, 'getData', args.filters, {
    sections: ['detail'],
    detail: {
      layout: args.layout,
      keyword: args.keyword,
      status: args.status,
      page: args.page,
      quadrant_pages: args.quadrantPages
    }
  })
  const detail = (result.detail ?? {}) as PmsRecord
  const people = (detail.people ?? {}) as PmsRecord
  const total = Number(detail.total) || 0
  const quadrants = (detail.quadrants ?? {}) as Record<string, PmsRecord>
  const buckets =
    args.layout === 'eisenhower'
      ? QUADRANTS.map((key) => bucket(key, quadrants[key] ?? {}, people))
      : args.layout === 'project'
        ? (Array.isArray(detail.groups) ? (detail.groups as PmsRecord[]) : []).map((group) =>
            bucket(pmsField(group, 'key'), group, people)
          )
        : [bucket('all', { rows: detail.rows, total }, people)]
  return {
    layout: args.layout,
    scope: await dashboardScope(result),
    statuses: Array.isArray(detail.statuses) ? detail.statuses.map(String) : [],
    total,
    buckets,
    page: Number(detail.page) || 1,
    pageCount: Math.max(1, Math.ceil(total / DASHBOARD_PAGE_SIZE)),
    pageSize: args.layout === 'eisenhower' ? DASHBOARD_QUADRANT_PAGE_SIZE : DASHBOARD_PAGE_SIZE
  }
}

/** Everyone the missing-field form can name as Người xác minh / xử lý. */
export async function pmsUsers(): Promise<PmsUser[]> {
  const pms = await connectedClient()
  // getListUser rejects max_rows above 100 (with success "0", not an HTTP error).
  const pageSize = 100
  const users: PmsRecord[] = []
  for (let offset = 0; ; offset += pageSize) {
    const data = await pms.cloudWork({
      RequestAction: 'getListUser',
      Params: { paging: { offset, max_rows: pageSize } }
    })
    if (String(data.success) === '0') {
      throw new Error(`PMS getListUser: ${String(data.message ?? 'failed')}`)
    }
    const page = Object.values(
      (data.entry_list && typeof data.entry_list === 'object' ? data.entry_list : {}) as Record<
        string,
        PmsRecord
      >
    )
    users.push(...page)
    if (page.length < pageSize) {
      break
    }
  }
  return users
    .map((user) => ({
      id: pmsField(user, 'id'),
      name:
        pmsField(user, 'full_name') ||
        `${pmsField(user, 'first_name')} ${pmsField(user, 'last_name')}`.trim() ||
        pmsField(user, 'user_name')
    }))
    .filter((user) => user.id)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function pmsTicketFieldOptions(field: unknown): Promise<PmsStatusOption[]> {
  const name = z.string().parse(field)
  if (TICKET_FORM_FIELD_RULES[name]?.kind !== 'picklist') {
    throw new Error(`${name} is not a ticket picklist field.`)
  }
  return picklist('HelpDesk', name)
}
