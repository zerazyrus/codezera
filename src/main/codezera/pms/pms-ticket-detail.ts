import {
  PMS_TICKET_EDIT_FIELDS,
  type PmsStatusOption,
  type PmsStatusStep,
  type PmsTicketEditField,
  type PmsTicketExtras
} from '../../../shared/codezera/pms-types'
import type { PmsClient } from './pms-client'
import { pmsUsers } from './pms-queue'
import { pmsField, type PmsRecord } from './pms-records'
import { picklist } from './pms-service'

const PICKLIST_FIELDS: PmsTicketEditField[] = PMS_TICKET_EDIT_FIELDS.filter(
  (field) => field !== 'ticket_title' && field !== 'expected_date'
)

let userNames: Map<string, string> | null = null

/** `[{id:"Users:592", name:"Bùi Thu Hường (huong.bui@…)"}]` → id → name without the email. */
function ownerNames(record: PmsRecord): Map<string, string> {
  const names = new Map<string, string>()
  for (const key of ['assigned_owners', 'follower']) {
    const list = record[key]
    if (!Array.isArray(list)) {
      continue
    }
    for (const entry of list as PmsRecord[]) {
      const id = pmsField(entry, 'id').replace(/^Users:/, '')
      const name = pmsField(entry, 'name').replace(/\s*\([^)]*@[^)]*\)\s*$/, '')
      if (id && name) {
        names.set(id, name)
      }
    }
  }
  return names
}

async function personName(names: Map<string, string>, id: string): Promise<string | null> {
  if (!id || id === '0') {
    return null
  }
  const known = names.get(id)
  if (known) {
    return known
  }
  userNames ??= new Map((await pmsUsers()).map((user) => [user.id, user.name]))
  return userNames.get(id) ?? null
}

/** Label of a reference id through OpenAPI retrieve; null when unset or not visible. */
async function referenceLabel(pms: PmsClient, module: string, id: string): Promise<string | null> {
  if (!id || id === '0') {
    return null
  }
  try {
    const payload = await pms.openApi('retrieve', { module, record: id })
    const data = (payload.data ?? {}) as PmsRecord
    return pmsField(data, 'label') || null
  } catch {
    return null
  }
}

function images(record: PmsRecord): { name: string; url: string }[] {
  const list = record.imagename
  if (!Array.isArray(list)) {
    return []
  }
  return (list as PmsRecord[])
    .map((entry) => ({ name: pmsField(entry, 'name'), url: pmsField(entry, 'path') }))
    .filter((image) => image.url.startsWith('https://'))
}

function steps(record: PmsRecord): Record<string, PmsStatusStep> {
  const raw = record.progress_data
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, PmsRecord>).map(([status, node]) => {
      const state = pmsField(node, 'state')
      return [
        status,
        {
          state: state === 'finished' || state === 'in_progress' ? state : 'not_yet',
          by: pmsField(node, 'updated_by'),
          at: pmsField(node, 'started_time')
        }
      ]
    })
  )
}

/** What the PMS status modal shows besides the description: picklists, customer, assignment, trail. */
export async function ticketExtras(pms: PmsClient, record: PmsRecord): Promise<PmsTicketExtras> {
  const names = ownerNames(record)
  const optionLists = await Promise.all(
    PICKLIST_FIELDS.map(async (field) => [field, await picklist('HelpDesk', field)] as const)
  )
  const [install, contact, reception, verification, processing] = await Promise.all([
    referenceLabel(pms, 'CPInstance', pmsField(record, 'related_cpinstance')),
    referenceLabel(pms, 'Contacts', pmsField(record, 'contact_id')),
    personName(names, pmsField(record, 'reception_user_id')),
    personName(names, pmsField(record, 'verification_user_id')),
    personName(names, pmsField(record, 'processing_user_id'))
  ])
  const followers = Array.isArray(record.follower)
    ? (record.follower as PmsRecord[])
        .map((entry) => names.get(pmsField(entry, 'id').replace(/^Users:/, '')) ?? '')
        .filter(Boolean)
    : []
  return {
    values: Object.fromEntries(
      PMS_TICKET_EDIT_FIELDS.map((field) => [field, pmsField(record, field)])
    ) as Record<PmsTicketEditField, string>,
    options: Object.fromEntries(optionLists) as Partial<
      Record<PmsTicketEditField, PmsStatusOption[]>
    >,
    install,
    account: pmsField(record, 'parent_name') || null,
    contact,
    source: pmsField(record, 'helpdesk_source'),
    reception,
    verification,
    processing,
    followers,
    images: images(record),
    steps: steps(record)
  }
}
