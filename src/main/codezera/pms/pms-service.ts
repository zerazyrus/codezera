import { z } from 'zod'
import type {
  PmsDetailSectionKey,
  PmsItemDetail,
  PmsItemKind,
  PmsListResult,
  PmsStatus,
  PmsStatusOption
} from '../../../shared/codezera/pms-types'
import {
  clearPmsAccount,
  loadPmsAccount,
  parsePmsAccount,
  readPmsSkillConfig,
  savePmsAccount,
  type PmsAccount
} from './pms-account-store'
import { PmsClient } from './pms-client'
import { ticketExtras } from './pms-ticket-detail'
import {
  pmsField,
  pmsHtmlToText,
  taskStatusFields,
  toPmsItem,
  toStatusOptions,
  type PmsRecord
} from './pms-records'

const PAGE_SIZE = 30

const KindSchema = z.enum(['ticket', 'task'])
export const IdSchema = z.string().regex(/^\d+$/)
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const ListArgsSchema = z.object({
  kind: KindSchema,
  status: z.string().max(100).nullable(),
  search: z.string().max(200),
  offset: z.number().int().min(0),
  /** An employee id, or `all` for everyone; the user's own when absent. */
  ownerId: z.union([IdSchema, z.literal('all')]).optional()
})

const ItemArgsSchema = z.object({ kind: KindSchema, id: IdSchema })

const LogTimeArgsSchema = z
  .object({
    kind: KindSchema,
    id: IdSchema,
    hours: z.number().int().min(0).max(24),
    minutes: z.number().int().min(0).max(59),
    category: z.string().min(1).max(100),
    date: DateSchema,
    description: z.string().max(5000)
  })
  .refine((args) => args.hours * 60 + args.minutes > 0, 'Log at least one minute.')

const MODULE: Record<PmsItemKind, string> = { ticket: 'HelpDesk', task: 'ProjectTask' }
const STATUS_FIELD: Record<PmsItemKind, string> = {
  ticket: 'ticketstatus',
  task: 'projecttaskstatus'
}

let client: PmsClient | null = null
const picklistCache = new Map<string, PmsStatusOption[]>()

const TICKET_SECTION_FIELDS: [PmsDetailSectionKey, string][] = [
  ['description', 'description'],
  ['steps', 'steps_to_reproduce'],
  ['expected', 'expected_result'],
  ['actual', 'actual_result'],
  ['solution', 'solution']
]
const TASK_SECTION_FIELDS: [PmsDetailSectionKey, string][] = [['description', 'description']]

export async function connectedClient(): Promise<PmsClient> {
  if (!client) {
    const account = await loadPmsAccount()
    if (!account) {
      throw new Error('PMS is not connected. Connect it in Settings → Accounts.')
    }
    client = new PmsClient(account)
  }
  if (!client.user) {
    await client.login()
  }
  return client
}

function connectedStatus(pms: PmsClient): PmsStatus {
  return {
    state: 'connected',
    baseUrl: pms.account.baseUrl,
    username: pms.account.username,
    userId: pms.user?.id ?? '',
    userName: pms.user?.name ?? pms.account.username
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function getPmsStatus(): Promise<PmsStatus> {
  let account: PmsAccount | null
  try {
    account = await loadPmsAccount()
  } catch (error) {
    return { state: 'error', baseUrl: '', username: '', message: errorText(error) }
  }
  if (!account) {
    return { state: 'not-configured', skillConfigFound: (await readPmsSkillConfig()) !== null }
  }
  try {
    return connectedStatus(await connectedClient())
  } catch (error) {
    return {
      state: 'error',
      baseUrl: account.baseUrl,
      username: account.username,
      message: errorText(error)
    }
  }
}

/** Saves only credentials that pass both logins, so a typo never replaces a working account. */
export async function connectPms(input: unknown): Promise<PmsStatus> {
  const candidate = new PmsClient(parsePmsAccount(input))
  await candidate.login()
  await candidate.openApi('me', {})
  savePmsAccount(candidate.account)
  client = candidate
  picklistCache.clear()
  return connectedStatus(candidate)
}

export async function connectPmsFromSkillConfig(): Promise<PmsStatus> {
  const config = await readPmsSkillConfig()
  if (!config) {
    throw new Error('No /pms skill config found at ~/.omp/skills/pms/config.json.')
  }
  return connectPms(config)
}

export async function disconnectPms(): Promise<PmsStatus> {
  await clearPmsAccount()
  client = null
  picklistCache.clear()
  return getPmsStatus()
}

export async function picklist(module: string, field: string): Promise<PmsStatusOption[]> {
  const key = `${module}.${field}`
  const cached = picklistCache.get(key)
  if (cached) {
    return cached
  }
  const pms = await connectedClient()
  const payload = await pms.openApi('metadata', { module })
  const metadata = (payload.metadata ?? {}) as PmsRecord
  const options = toStatusOptions(((metadata.picklist_options ?? {}) as PmsRecord)[field])
  picklistCache.set(key, options)
  return options
}

export async function pmsStatusOptions(kind: unknown): Promise<PmsStatusOption[]> {
  const parsed = KindSchema.parse(kind)
  return picklist(MODULE[parsed], STATUS_FIELD[parsed])
}

export async function pmsLogTimeCategories(): Promise<PmsStatusOption[]> {
  return picklist('CPTimeSheets', 'cptimesheets_task')
}

export async function listPmsItems(input: unknown): Promise<PmsListResult> {
  const args = ListArgsSchema.parse(input)
  const pms = await connectedClient()
  // main_owner_id is the person responsible; assigned_user_id may hold a multi-owner group.
  const owner = args.ownerId ?? pms.user?.id ?? ''
  const filters: PmsRecord[] =
    owner === 'all' ? [] : [{ name: 'main_owner_id', value: owner, operator: 'e' }]
  if (args.status) {
    filters.push({ name: STATUS_FIELD[args.kind], value: args.status, operator: 'e' })
  }
  const search = args.search.trim()
  if (search) {
    const ticketNumber = args.kind === 'ticket' ? /^#?(\d+)$/.exec(search) : null
    filters.push(
      ticketNumber
        ? { name: 'ticket_no', value: `#${ticketNumber[1]}`, operator: 'e' }
        : {
            name: args.kind === 'ticket' ? 'ticket_title' : 'projecttaskname',
            value: search,
            operator: 'c'
          }
    )
  }
  const data = await pms.cloudWork({
    RequestAction: args.kind === 'ticket' ? 'getListTicket' : 'getListProjectTask',
    Params: { filters, paging: { offset: args.offset, max_rows: PAGE_SIZE } }
  })
  const rows = Array.isArray(data.entry_list) ? (data.entry_list as PmsRecord[]) : []
  const paging = (data.paging ?? {}) as PmsRecord
  const nextOffset = Number(pmsField(paging, 'next_offset'))
  return {
    items: rows.map((row) => toPmsItem(pms.account.baseUrl, args.kind, row)),
    total: Number(pmsField(paging, 'total_count')) || rows.length,
    nextOffset: rows.length === PAGE_SIZE && nextOffset > args.offset ? nextOffset : null
  }
}

async function nextStatuses(pms: PmsClient, kind: PmsItemKind, current: string) {
  if (kind === 'task') {
    return (await pmsStatusOptions('task')).filter((option) => option.value !== current)
  }
  // The server lists only the moves its ticket workflow allows from `current`.
  const data = await pms.cloudWork({
    RequestAction: 'getEnumListTicketStatus',
    Params: { ticketstatus: current }
  })
  return toStatusOptions(data.data).filter((option) => option.value !== current)
}

export async function getPmsItem(input: unknown): Promise<PmsItemDetail> {
  const { kind, id } = ItemArgsSchema.parse(input)
  const pms = await connectedClient()
  const data = await pms.cloudWork({
    RequestAction: kind === 'ticket' ? 'retrieveTicket' : 'retrieveProjectTask',
    Params: { id: Number(id) }
  })
  const record = (data.data && typeof data.data === 'object' ? data.data : data) as PmsRecord
  if (String(data.success ?? '1') === '0' || !pmsField(record, STATUS_FIELD[kind])) {
    throw new Error(`PMS ${kind} ${id} was not found or you cannot view it.`)
  }
  const item = toPmsItem(pms.account.baseUrl, kind, { ...record, id })
  return {
    ...item,
    id,
    sections: (kind === 'ticket' ? TICKET_SECTION_FIELDS : TASK_SECTION_FIELDS).flatMap(
      ([key, field]) => {
        const text = pmsHtmlToText(pmsField(record, field))
        return text ? [{ key, text }] : []
      }
    ),
    category: pmsField(record, kind === 'ticket' ? 'ticketcategories' : 'projecttasktype'),
    createdTime: pmsField(record, 'createdtime'),
    ...(await Promise.all([
      nextStatuses(pms, kind, item.status),
      kind === 'ticket' ? ticketExtras(pms, record) : null
    ]).then(([next, ticket]) => ({ nextStatuses: next, ticket })))
  }
}

export function localDate(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export async function setPmsItemStatus(input: unknown): Promise<PmsItemDetail> {
  const { id, status } = z
    .object({ kind: z.literal('task'), id: IdSchema, status: z.string().min(1).max(100) })
    .parse(input)
  const pms = await connectedClient()
  await pms.openApi(
    'update',
    { module: 'ProjectTask' },
    {
      module: 'ProjectTask',
      record: id,
      data: { ...taskStatusFields(status, localDate()), record: id }
    }
  )
  return getPmsItem({ kind: 'task', id })
}

export async function logPmsTime(input: unknown): Promise<void> {
  const args = LogTimeArgsSchema.parse(input)
  const pms = await connectedClient()
  const item = await getPmsItem({ kind: args.kind, id: args.id })
  const data: PmsRecord = {
    related_to: args.id,
    apply_date: args.date,
    cptimesheets_hours: String(args.hours),
    cptimesheets_minutes: String(args.minutes),
    cptimesheets_task: args.category,
    name: `Log ${args.date}`,
    description: args.description.trim() || item.title,
    assigned_user_id: `Users:${pms.user?.id ?? ''}`
  }
  // PMS only derives the project in its web form; reports group timesheets by it.
  if (item.projectId) {
    data.related_project = item.projectId
  }
  await pms.openApi('create', { module: 'CPTimeSheets' }, { module: 'CPTimeSheets', data })
}

export async function pmsLoggedHours(date: unknown): Promise<number> {
  const day = DateSchema.parse(date)
  const pms = await connectedClient()
  const data = await pms.cloudWork({
    RequestAction: 'getTotalTime',
    Params: {
      filters: [
        { name: 'apply_date', value: `${day},${day}`, operator: 'between' },
        { name: 'main_owner_id', value: pms.user?.id ?? '', operator: 'e' }
      ]
    }
  })
  return Number(pmsField(data, 'total')) || 0
}
