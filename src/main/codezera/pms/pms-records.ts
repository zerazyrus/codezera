import type { PmsItem, PmsItemKind, PmsStatusOption } from '../../../shared/codezera/pms-types'

export type PmsRecord = Record<string, unknown>

function isPmsRecord(value: unknown): value is PmsRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A nested PMS object; PHP encodes an empty map as []. */
export function pmsRecord(value: unknown): PmsRecord {
  return isPmsRecord(value) ? value : {}
}

/** PMS returns every scalar as a string; reference fields can come back as `{value,label}` objects. */
export function pmsField(record: PmsRecord, key: string): string {
  const value = record[key]
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return pmsField(value as PmsRecord, 'value')
  }
  return ''
}

function referenceLabel(record: PmsRecord, key: string): string | null {
  const value = record[key]
  if (value && typeof value === 'object' && 'label' in value) {
    return pmsField(value as PmsRecord, 'label') || null
  }
  return pmsField(record, `${key}_label`) || pmsField(record, `${key}_name`) || null
}

/** PMS stores "0" for an empty reference. */
function referenceId(record: PmsRecord, key: string): string | null {
  const id = pmsField(record, key)
  return id && id !== '0' ? id : null
}

export function pmsRecordUrl(baseUrl: string, kind: PmsItemKind, id: string): string {
  const module = kind === 'ticket' ? 'HelpDesk' : 'ProjectTask'
  return `${baseUrl}/index.php?module=${module}&view=Detail&record=${encodeURIComponent(id)}`
}

/** Maps a CloudWORK list row or retrieve payload; tickets and tasks name the same facts differently. */
export function toPmsItem(baseUrl: string, kind: PmsItemKind, record: PmsRecord): PmsItem {
  const id =
    pmsField(record, kind === 'ticket' ? 'ticketid' : 'projecttaskid') || pmsField(record, 'id')
  const projectKey = kind === 'ticket' ? 'related_project' : 'projectid'
  return {
    kind,
    id,
    number: pmsField(record, kind === 'ticket' ? 'ticket_no' : 'projecttask_no'),
    title:
      kind === 'ticket'
        ? pmsField(record, 'ticket_title') || pmsField(record, 'label')
        : pmsField(record, 'projecttaskname'),
    status: pmsField(record, kind === 'ticket' ? 'ticketstatus' : 'projecttaskstatus'),
    priority: pmsField(record, kind === 'ticket' ? 'ticketpriorities' : 'projecttaskpriority'),
    projectId: referenceId(record, projectKey),
    projectLabel: referenceLabel(record, projectKey),
    hours: Number(pmsField(record, kind === 'ticket' ? 'hours' : 'projecttaskhours')) || 0,
    url: pmsRecordUrl(baseUrl, kind, id)
  }
}

export function toStatusOptions(raw: unknown): PmsStatusOption[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }
    const record = entry as PmsRecord
    const value = pmsField(record, 'value')
    if (!value) {
      return []
    }
    return [
      { value, label: pmsField(record, 'label') || value, color: pmsField(record, 'color') || null }
    ]
  })
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

/** Ticket and task descriptions are CKEditor HTML; the panel and agent prompts need plain text. */
export function pmsHtmlToText(html: string): string {
  return html
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|ul|ol|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code.startsWith('#x') || code.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
      }
      if (code.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
      }
      return HTML_ENTITIES[code.toLowerCase()] ?? entity
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** PMS business rules for task status moves, ported from the `/pms` skill: dates and progress follow the status. */
export function taskStatusFields(status: string, today: string): PmsRecord {
  const fields: PmsRecord = { projecttaskstatus: status }
  const trimmed = status.trim()
  if (trimmed === 'In Progress') {
    fields.startdate = today
    fields.start_date_plan = today
  }
  if (trimmed === 'Completed' || trimmed === 'Completed Late') {
    fields.enddate = today
    fields.end_date_plan = today
    fields.projecttaskprogress = '100%'
  }
  if (trimmed === 'Canceled') {
    fields.enddate = today
    fields.end_date_plan = today
  }
  return fields
}
