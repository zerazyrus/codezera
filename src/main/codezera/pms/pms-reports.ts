import { z } from 'zod'
import type {
  PmsReportEntry,
  PmsReportPreview,
  PmsReportSubmitResult,
  PmsReportType
} from '../../../shared/codezera/pms-types'
import type { PmsClient } from './pms-client'
import { pmsField, type PmsRecord } from './pms-records'
import { connectedClient, IdSchema } from './pms-service'

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const PreviewArgsSchema = z.object({ type: z.enum(['day', 'week']), date: DateSchema })
const SubmitArgsSchema = z.object({
  type: z.enum(['day', 'week']),
  date: DateSchema,
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(20_000),
  recipientIds: z.array(IdSchema).max(20),
  draft: z.boolean()
})

type ReportModule = PmsReportEntry['module']

const NAME_FIELDS: Record<ReportModule, [string, string]> = {
  HelpDesk: ['ticket_title', 'ticketstatus'],
  ProjectTask: ['projecttaskname', 'projecttaskstatus'],
  Calendar: ['subject', 'taskstatus']
}

/** `[Project] rest` titles carry a shorter project tag than `related_project`. */
const TITLE_TAG = /^\s*\[([^\]]+)\]\s*(.+?)\s*$/

function isoDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Monday..Sunday of the ISO week holding `date`, and its week number. */
export function isoWeek(date: string): { start: string; end: string; week: number } {
  const day = new Date(`${date}T00:00:00`)
  const monday = new Date(day)
  monday.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const thursday = new Date(monday)
  thursday.setDate(monday.getDate() + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return { start: isoDate(monday), end: isoDate(sunday), week }
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = []
  for (
    const day = new Date(`${start}T00:00:00`);
    isoDate(day) <= end;
    day.setDate(day.getDate() + 1)
  ) {
    days.push(isoDate(day))
  }
  return days
}

function moduleOf(row: PmsRecord): ReportModule {
  if (pmsField(row, 'related_toticket_title_id')) {
    return 'HelpDesk'
  }
  return pmsField(row, 'related_toprojecttaskstatus_id') ? 'ProjectTask' : 'Calendar'
}

async function listOpenApi(
  pms: PmsClient,
  module: string,
  filters: PmsRecord[],
  maxRows: number
): Promise<PmsRecord[]> {
  const payload = await pms.openApi('list', {
    module,
    filters: JSON.stringify(filters),
    max_rows: String(maxRows)
  })
  return Array.isArray(payload.entry_list) ? (payload.entry_list as PmsRecord[]) : []
}

/**
 * My timesheets on each day, merged per logged record. PMS filters CPTimeSheets reliably only by
 * one `apply_date`, so a week is seven queries.
 */
async function collectEntries(
  pms: PmsClient,
  days: string[]
): Promise<{ entries: PmsReportEntry[]; perDay: Record<string, number> }> {
  const me = pms.user?.id ?? ''
  const rowsByDay = await Promise.all(
    days.map((day) =>
      listOpenApi(
        pms,
        'CPTimeSheets',
        [
          { name: 'main_owner_id', value: me, operator: 'e' },
          { name: 'apply_date', value: day, operator: 'e' }
        ],
        100
      )
    )
  )
  const perDay: Record<string, number> = {}
  const merged = new Map<string, Omit<PmsReportEntry, 'name' | 'status'>>()
  rowsByDay.forEach((rows, index) => {
    perDay[days[index]] = 0
    for (const row of rows) {
      const recordId = pmsField(row, 'related_to')
      if (!recordId) {
        continue
      }
      const hours = Number(pmsField(row, 'total_hours')) || 0
      perDay[days[index]] += hours
      const module = moduleOf(row)
      const key = `${module}:${recordId}`
      const entry = merged.get(key) ?? {
        module,
        recordId,
        hours: 0,
        projectLabel: pmsField(row, 'related_project_label'),
        notes: []
      }
      entry.hours += hours
      const note = pmsField(row, 'description')
      if (note && !entry.notes.includes(note)) {
        entry.notes.push(note)
      }
      merged.set(key, entry)
    }
  })
  const entries = await Promise.all(
    [...merged.values()].map(async (entry) => {
      const [nameField, statusField] = NAME_FIELDS[entry.module]
      const record = await pms
        .openApi('retrieve', { module: entry.module, record: entry.recordId })
        .then((payload) => (payload.data ?? {}) as PmsRecord)
        .catch(() => ({}) as PmsRecord)
      return {
        ...entry,
        hours: Math.round(entry.hours * 100) / 100,
        name: pmsField(record, nameField) || pmsField(record, 'label') || `#${entry.recordId}`,
        status: pmsField(record, statusField)
      }
    })
  )
  for (const day of days) {
    perDay[day] = Math.round(perDay[day] * 100) / 100
  }
  return { entries: entries.sort((a, b) => b.hours - a.hours), perDay }
}

/** Entries by project tag, first-seen order: the title's `[tag]`, else the timesheet project. */
export function groupByProject(
  entries: PmsReportEntry[]
): { project: string; tasks: { entry: PmsReportEntry; title: string }[] }[] {
  const groups = new Map<string, { entry: PmsReportEntry; title: string }[]>()
  for (const entry of entries) {
    const tagged = TITLE_TAG.exec(entry.name)
    const project = tagged?.[1].trim() || entry.projectLabel || ''
    const list = groups.get(project) ?? []
    list.push({ entry, title: tagged?.[2].trim() || entry.name })
    groups.set(project, list)
  }
  return [...groups].map(([project, tasks]) => ({ project, tasks }))
}

/** Team style: one task per line, `- [Project] task`, a blank line between projects. */
export function draftDescription(type: PmsReportType, entries: PmsReportEntry[]): string {
  const body = groupByProject(entries)
    .map(({ project, tasks }) =>
      tasks.map(({ title }) => `- [${project || 'Khác'}] ${title}`).join('\n')
    )
    .join('\n\n')
  return type === 'day' ? body : `Đã thực hiện\n${body}\n\nDự kiến tuần sau\n- `
}

function span(type: PmsReportType, date: string): { start: string; end: string; week: number } {
  const week = isoWeek(date)
  return type === 'day' ? { start: date, end: date, week: week.week } : week
}

function slashDate(date: string): string {
  return date.split('-').toReversed().join('/')
}

async function existingReports(
  pms: PmsClient,
  type: PmsReportType,
  start: string
): Promise<PmsReportPreview['existing']> {
  const rows = await listOpenApi(
    pms,
    'CPReportTask',
    [
      { name: 'main_owner_id', value: pms.user?.id ?? '', operator: 'e' },
      { name: type === 'day' ? 'apply_date' : 'start_date', value: start, operator: 'e' },
      { name: 'cpreporttask_type', value: type, operator: 'e' }
    ],
    5
  )
  return rows.map((row) => {
    const id = pmsField(row, 'id').replace(/^\d+x/, '')
    return {
      id,
      number: pmsField(row, 'cpreporttask_no') || id,
      status: pmsField(row, 'cpreporttask_status'),
      url: `${pms.account.baseUrl}/index.php?module=CPReportTask&view=Detail&record=${id}`
    }
  })
}

export async function pmsReportPreview(input: unknown): Promise<PmsReportPreview> {
  const args = PreviewArgsSchema.parse(input)
  const pms = await connectedClient()
  const { start, end, week } = span(args.type, args.date)
  const [{ entries, perDay }, existing] = await Promise.all([
    collectEntries(pms, daysBetween(start, end)),
    existingReports(pms, args.type, start)
  ])
  const userName = pms.user?.name ?? pms.account.username
  return {
    type: args.type,
    start,
    end,
    week,
    totalHours: Math.round(entries.reduce((sum, entry) => sum + entry.hours, 0) * 100) / 100,
    perDay,
    entries,
    existing,
    managerIds: pms.managerIds,
    name:
      args.type === 'day'
        ? `${userName} - Báo cáo ${slashDate(start)}`
        : `${userName} - Báo cáo tuần ${week} (${slashDate(start)} - ${slashDate(end)})`,
    description: draftDescription(args.type, entries)
  }
}

/**
 * Creates the CPReportTask. Task lists go as real arrays: OpenAPI decodes the body once, and the
 * server's validateTasks rejects a JSON string. Weekly reports render only `description`, but
 * validation still needs the week's tasks. Owners match the web form (Owner.tpl getDirectManagerId):
 * me first, as PMS takes the first owner as main_owner_id, then my managers, then extra recipients.
 */
export async function submitPmsReport(input: unknown): Promise<PmsReportSubmitResult> {
  const args = SubmitArgsSchema.parse(input)
  const pms = await connectedClient()
  const me = pms.user?.id ?? ''
  const { start, end } = span(args.type, args.date)
  const [{ entries }, existing] = await Promise.all([
    collectEntries(pms, daysBetween(start, end)),
    existingReports(pms, args.type, start)
  ])
  if (existing.length > 0) {
    throw new Error(`Already reported: ${existing.map((report) => report.number).join(', ')}.`)
  }
  if (entries.length === 0) {
    throw new Error('No time logged in this period.')
  }
  const owners = [...new Set([me, ...pms.managerIds, ...args.recipientIds])]
  const created = await pms.openApi(
    'create',
    { module: 'CPReportTask' },
    {
      module: 'CPReportTask',
      data: {
        name: args.name,
        description: args.description,
        cpreporttask_type: args.type,
        cpreporttask_status: args.draft ? 'Draft' : 'Reported',
        // 'project' files everything under "Không xác định" (server bug); taskstatus is what /pms sends.
        cpreporttask_group_by: 'taskstatus',
        apply_date: start,
        start_date: start,
        end_date: end,
        assigned_user_id: owners.map((id) => `Users:${id}`).join(','),
        cpreporttask_task_current: entries.map((entry) => ({
          module: entry.module,
          record_id: entry.recordId,
          mode: 'current'
        })),
        cpreporttask_task_up_coming: []
      }
    }
  )
  const id =
    pmsField(created, 'record_id') || pmsField((created.data ?? {}) as PmsRecord, 'record_id')
  return {
    id,
    url: id ? `${pms.account.baseUrl}/index.php?module=CPReportTask&view=Detail&record=${id}` : null
  }
}
