import {
  PMS_TICKET_STATUS_PHASES,
  type PmsFormField,
  type PmsFormFieldKind
} from '../../../shared/codezera/pms-types'
import type { PmsRecord } from './pms-records'

/**
 * Ticket workflow rules ported from the `/pms` skill (`~/.omp/skills/pms/scripts/pms.py`), which
 * mirrors pms2019 `HelpDesk_TicketForm_Model` + TicketFormRules.js. The web status modal enforces
 * them in JS only and the APIs skip them, so Codezera checks them itself. Keep in sync with pms.py.
 */
export const TICKET_STATUS_PHASES: Record<string, readonly string[]> = PMS_TICKET_STATUS_PHASES
export const TICKET_TERMINATED_STATUSES = ['Cancel', 'Reject']
const STATUS_RANK_AS: Record<string, string> = { Reopen: 'Open' }
const ISSUE_CATEGORIES = ['Bug', 'Change Request']

/** Statuses at/after `from` in phase order (Reopen ranks as Open), terminated excluded. */
function statusesFrom(from: string): string[] {
  const ordered = Object.values(TICKET_STATUS_PHASES)
    .flat()
    .filter((status) => !TICKET_TERMINATED_STATUSES.includes(status))
  const start = ordered.indexOf(from)
  return ordered.filter((status) => ordered.indexOf(STATUS_RANK_AS[status] ?? status) >= start)
}

type Conditions = Record<string, string[]>
type FieldRule = { label: string; kind: PmsFormFieldKind; show: Conditions; require: Conditions }

const ISSUE: Conditions = { ticketcategories: ISSUE_CATEGORIES }
const BUG: Conditions = { ticketcategories: ['Bug'] }

export const TICKET_FORM_FIELD_RULES: Record<string, FieldRule> = {
  description: { label: 'Mô tả', kind: 'textarea', show: {}, require: BUG },
  related_project: {
    label: 'Dự án',
    kind: 'reference',
    show: {},
    require: { ticketcategories: ['Bug', 'Improve'] }
  },
  related_cpinstance: {
    label: 'Link cài đặt',
    kind: 'reference',
    show: {},
    require: { ticketcategories: ['Bug', 'Improve'] }
  },
  ticketseverities: { label: 'Mức độ nghiêm trọng', kind: 'picklist', show: BUG, require: BUG },
  helpdesk_bug_type: { label: 'Phân loại lỗi', kind: 'picklist', show: BUG, require: BUG },
  steps_to_reproduce: { label: 'Các bước lặp case', kind: 'textarea', show: BUG, require: BUG },
  expected_result: { label: 'Kết quả mong đợi', kind: 'textarea', show: BUG, require: BUG },
  actual_result: { label: 'Kết quả thực tế', kind: 'textarea', show: BUG, require: BUG },
  expected_date: {
    label: 'Ngày mong muốn hoàn thành',
    kind: 'date',
    show: {},
    require: { ticketpriorities: ['High', 'Urgent'] }
  },
  helpdesk_detection_phase: {
    label: 'Giai đoạn phát hiện',
    kind: 'picklist',
    show: ISSUE,
    require: ISSUE
  },
  helpdesk_error_cause: {
    label: 'Nguyên nhân vấn đề',
    kind: 'picklist',
    show: ISSUE,
    require: { ...ISSUE, ticketstatus: statusesFrom('Wait For Verifying') }
  },
  helpdesk_error_note: {
    label: 'Ghi chú nguyên nhân vấn đề',
    kind: 'textarea',
    show: ISSUE,
    require: { ...ISSUE, helpdesk_error_cause: ['ec_other'] }
  },
  verification_user_id: {
    label: 'Người xác minh',
    kind: 'user',
    show: {},
    require: { ticketstatus: statusesFrom('Wait For Verifying') }
  },
  processing_user_id: {
    label: 'Người xử lý',
    kind: 'user',
    show: {},
    require: { ticketstatus: statusesFrom('Assigned') }
  },
  expected_doneline: {
    label: 'Ngày dự kiến hoàn thành',
    kind: 'date',
    show: {},
    require: { ticketstatus: statusesFrom('In Progress') }
  },
  cancel_reason: {
    label: 'Lý do hủy',
    kind: 'textarea',
    show: {},
    require: { ticketstatus: TICKET_TERMINATED_STATUSES }
  }
}

/** Assigned To follows these users in order (first = main owner). */
export const TICKET_ASSIGNMENT_USER_FIELDS = [
  'processing_user_id',
  'verification_user_id',
  'reception_user_id'
]

const ERROR_CAUSE_BY_DETECTION_PHASE: Record<string, Record<string, string>> = {
  Bug: {
    dp_internal_test: 'ec_implementation',
    dp_uat: 'ec_testing_missed',
    dp_production: 'ec_testing_missed'
  }
}

export type TicketValues = Record<string, string>

const text = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

function matches(conditions: Conditions, values: TicketValues): boolean {
  return Object.entries(conditions).every(([field, allowed]) =>
    allowed.includes(values[field] ?? '')
  )
}

/** Every visible field the status modal would require but is empty (user refs store "0" when unset). */
export function ticketFormMissing(values: TicketValues): PmsFormField[] {
  return Object.entries(TICKET_FORM_FIELD_RULES).flatMap(([field, rule]) => {
    const value = (values[field] ?? '').trim()
    const empty = value === '' || (rule.kind !== 'textarea' && value === '0')
    return matches(rule.show, values) && matches(rule.require, values) && empty
      ? [{ field, label: rule.label, kind: rule.kind }]
      : []
  })
}

/** Issue cause follows the detection phase while still empty (TicketForm.js auto-fill). */
export function autofillErrorCause(values: TicketValues, data: TicketValues): void {
  if ((values.helpdesk_error_cause ?? '').trim()) {
    return
  }
  const cause =
    ERROR_CAUSE_BY_DETECTION_PHASE[values.ticketcategories ?? '']?.[
      values.helpdesk_detection_phase ?? ''
    ]
  if (cause) {
    data.helpdesk_error_cause = cause
  }
}

function assignmentOwnerIds(values: TicketValues): string[] {
  const ids = TICKET_ASSIGNMENT_USER_FIELDS.map((field) => (values[field] ?? '').trim())
    .filter((id) => id !== '' && id !== '0')
    .map((id) => `Users:${id}`)
  return [...new Set(ids)]
}

/**
 * Rebuilds assigned_user_id like TicketForm.js syncAssignedUsers: assignment users first,
 * hand-added owners kept after. `currentOwners` are the ticket's `Users:<id>` owners.
 */
export function syncTicketOwners(
  record: TicketValues,
  currentOwners: string[],
  data: TicketValues
): void {
  if ('assigned_user_id' in data || !TICKET_ASSIGNMENT_USER_FIELDS.some((f) => f in data)) {
    return
  }
  const previous = assignmentOwnerIds(record)
  const assignment = assignmentOwnerIds({ ...record, ...data })
  const extras = currentOwners.filter((id) => !previous.includes(id) && !assignment.includes(id))
  const owners = [...assignment, ...extras]
  if (owners.length > 0 && owners.join(',') !== currentOwners.join(',')) {
    data.assigned_user_id = owners.join(',')
  }
}

/** Scalar ticket fields as the rules read them; reference objects collapse to their value. */
export function ticketValues(record: PmsRecord): TicketValues {
  const values: TicketValues = {}
  for (const [key, value] of Object.entries(record)) {
    const scalar =
      value && typeof value === 'object' && 'value' in value
        ? text((value as PmsRecord).value)
        : text(value)
    values[key] = scalar
  }
  return values
}

export function ownerIds(record: PmsRecord): string[] {
  const owners = Array.isArray(record.assigned_owners)
    ? (record.assigned_owners as PmsRecord[])
    : []
  return owners.map((owner) => text(owner.id)).filter(Boolean)
}

/** Ticket category → ProjectTask type when taking it; unmapped ones make the user pick. */
const CATEGORY_TO_TASK_TYPE: Record<string, string> = {
  Bug: 'Coding',
  Setup: 'System Admin',
  Improve: 'Coding',
  support: 'System Admin',
  'Change Request': 'Coding',
  portal_mini_app: 'Coding'
}

export function taskTypeForCategory(category: string): string | null {
  return CATEGORY_TO_TASK_TYPE[category] ?? null
}

const PRIORITY_TO_TASK_PRIORITY: Record<string, string> = {
  Low: 'low',
  Normal: 'normal',
  High: 'high',
  Urgent: 'very_high'
}

export function taskPriorityForTicket(priority: string): string {
  return PRIORITY_TO_TASK_PRIORITY[priority] ?? 'normal'
}

/** Ticket statuses whose move closes the linked ProjectTask: the processing part is over. */
export function linkedTaskStatusFor(ticketStatus: string): string | null {
  if (TICKET_TERMINATED_STATUSES.includes(ticketStatus)) {
    // PMS's picklist value carries the trailing space.
    return 'Canceled '
  }
  return [...TICKET_STATUS_PHASES.testing, ...TICKET_STATUS_PHASES.closing].includes(ticketStatus)
    ? 'Completed'
    : null
}

export const CLOSED_TASK_STATUSES = ['Completed', 'Completed Late', 'Canceled', 'Canceled ']

/** Solution text as `ticket finish` writes it. */
export function finishSolution(cause: string, solution: string): string {
  return [
    cause.trim() ? `Nguyên nhân:\n${cause.trim()}` : '',
    solution.trim() ? `Giải pháp:\n${solution.trim()}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** ProjectTask description from a ticket: source, where it happens, repro sections. */
export function linkedTaskDescription(
  values: TicketValues,
  plain: (html: string) => string
): string {
  const parts = [`Nguồn: Ticket ${values.ticket_no || ''} — ${values.ticket_title || ''}`.trim()]
  const link =
    ['trial_link', 'url', 'contact_crm_url'].map((f) => (values[f] ?? '').trim()).find(Boolean) ??
    ''
  if (link) {
    parts.push(`Link/Nơi gặp: ${link}`)
  }
  for (const [label, field] of [
    ['Mô tả vấn đề', 'description'],
    ['Các bước tái hiện', 'steps_to_reproduce'],
    ['Kết quả mong đợi', 'expected_result'],
    ['Kết quả thực tế', 'actual_result']
  ]) {
    const body = plain(values[field] ?? '')
    if (body) {
      parts.push(`${label}:\n${body}`)
    }
  }
  return parts.join('\n\n')
}
