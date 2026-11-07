import { z } from 'zod'
import type {
  PmsFormField,
  PmsLinkedTask,
  PmsNeedsFields,
  PmsTakeResult,
  PmsTicketSaveResult
} from '../../../shared/codezera/pms-types'
import type { PmsClient } from './pms-client'
import { pmsField, taskStatusFields, type PmsRecord } from './pms-records'
import { connectedClient, getPmsItem, IdSchema, localDate, picklist } from './pms-service'
import {
  autofillErrorCause,
  CLOSED_TASK_STATUSES,
  finishSolution,
  linkedTaskStatusFor,
  ownerIds,
  syncTicketOwners,
  TICKET_ASSIGNMENT_USER_FIELDS,
  ticketFormMissing,
  ticketValues,
  type TicketValues
} from './pms-ticket-rules'
import { pmsWebSession as webSession } from './pms-web-session'
import { addDays, createLinkedTask, projectOf, retrieveTicket } from './pms-linked-task'

const FieldsSchema = z.record(z.string().regex(/^[a-z_]+$/), z.string().max(20_000))
const StatusSchema = z.string().min(1).max(100)

const SaveArgsSchema = z.object({
  ticketId: IdSchema,
  status: StatusSchema.nullable(),
  fields: FieldsSchema
})
const TakeArgsSchema = z.object({
  ticketId: IdSchema,
  fields: FieldsSchema,
  taskType: z.string().min(1).max(100).nullable(),
  createTask: z.boolean()
})
const FinishArgsSchema = z.object({
  ticketId: IdSchema,
  status: StatusSchema,
  cause: z.string().max(20_000),
  solution: z.string().max(20_000),
  gitCommit: z.string().max(2_000),
  fields: FieldsSchema
})

const LINKED_TASK_SCAN = 100
const LINKED_TASK_FALLBACK_SCAN = 30

// ---------- ticket saves ----------

async function withOptions(fields: PmsFormField[]): Promise<PmsNeedsFields> {
  return {
    needs: 'fields',
    fields: await Promise.all(
      fields.map(async (field) =>
        field.kind === 'picklist'
          ? { ...field, options: await picklist('HelpDesk', field.field) }
          : field
      )
    )
  }
}

/** Status-modal auto-fills + owner sync into `data`; returns what the modal would still require. */
function prepareTicketChange(record: PmsRecord, data: TicketValues): PmsFormField[] {
  const values = ticketValues(record)
  autofillErrorCause({ ...values, ...data }, data)
  syncTicketOwners(values, ownerIds(record), data)
  return ticketFormMissing({ ...values, ...data })
}

/**
 * User fields go through the web SaveAjax (OpenAPI rejects user ids as references), the rest
 * through OpenAPI; the status move last through CloudWORK, which validates it against the workflow.
 */
async function saveTicketData(pms: PmsClient, id: string, data: TicketValues): Promise<void> {
  const { ticketstatus: status, ...rest } = data
  const userFields = Object.fromEntries(
    Object.entries(rest).filter(([field]) => TICKET_ASSIGNMENT_USER_FIELDS.includes(field))
  )
  const otherFields = Object.fromEntries(
    Object.entries(rest).filter(([field]) => !TICKET_ASSIGNMENT_USER_FIELDS.includes(field))
  )
  if (Object.keys(userFields).length > 0) {
    await webSession(pms).action({
      module: 'HelpDesk',
      action: 'SaveAjax',
      record: id,
      ...userFields
    })
  }
  if (Object.keys(otherFields).length > 0) {
    await pms.openApi(
      'update',
      { module: 'HelpDesk' },
      { module: 'HelpDesk', record: id, data: { ...otherFields, record: id } }
    )
  }
  if (status) {
    const result = await pms.cloudWork({
      RequestAction: 'updateTicketStatus',
      Params: { ticket_id: Number(id), ticketstatus: status }
    })
    const success = pmsField(result, 'success')
    if (success === '2') {
      throw new Error(
        `PMS does not allow moving this ticket to "${status}" from its current status.`
      )
    }
    if (success !== '1') {
      throw new Error(
        `PMS did not update the ticket: ${pmsField(result, 'message') || 'unknown error'}`
      )
    }
  }
}

/**
 * The current user's ProjectTasks linked to the ticket. Neither API filters on `related_ticket`
 * (list rows do not even carry it), so recent tasks of the ticket's project are retrieved and
 * matched here, as the `/pms` skill does.
 */
async function linkedTasks(
  pms: PmsClient,
  ticketId: string,
  projectId: string,
  onlyOpen: boolean
): Promise<(PmsLinkedTask & { modified: string })[]> {
  const list = await pms.cloudWork({
    RequestAction: 'getListProjectTask',
    Params: {
      filters: [{ name: 'main_owner_id', value: pms.user?.id ?? '', operator: 'e' }],
      paging: { offset: 0, max_rows: LINKED_TASK_SCAN }
    }
  })
  const candidates = (
    Array.isArray(list.entry_list) ? (list.entry_list as PmsRecord[]) : []
  ).filter(
    (row) => !(onlyOpen && CLOSED_TASK_STATUSES.includes(pmsField(row, 'projecttaskstatus')))
  )
  // List rows omit related_ticket, so each candidate is retrieved; the ticket's project narrows that.
  const match = async (rows: PmsRecord[]): Promise<(PmsLinkedTask & { modified: string })[]> => {
    const tasks = await Promise.all(
      rows.map(async (row) => {
        const id = pmsField(row, 'id')
        const data = await pms.cloudWork({
          RequestAction: 'retrieveProjectTask',
          Params: { id: Number(id) }
        })
        const record = (data.data && typeof data.data === 'object' ? data.data : data) as PmsRecord
        return pmsField(record, 'related_ticket') === ticketId
          ? [
              {
                id,
                number: pmsField(record, 'projecttask_no'),
                title: pmsField(record, 'projecttaskname') || pmsField(row, 'projecttaskname'),
                status: pmsField(record, 'projecttaskstatus'),
                hours:
                  Number(pmsField(record, 'totaltime') || pmsField(record, 'projecttaskhours')) ||
                  0,
                modified: pmsField(record, 'modifiedtime')
              }
            ]
          : []
      })
    )
    return tasks.flat().sort((a, b) => b.modified.localeCompare(a.modified))
  }
  if (!projectId) {
    return match(candidates)
  }
  const inProject = await match(
    candidates.filter((row) => pmsField(row, 'projectid') === projectId)
  )
  if (inProject.length > 0) {
    return inProject
  }
  // A task may sit under a contract project (e.g. "Systech - PLHĐ 07") rather than the ticket's
  // customer project; check my most recent other tasks before reporting none.
  return match(
    candidates
      .filter((row) => pmsField(row, 'projectid') !== projectId)
      .slice(0, LINKED_TASK_FALLBACK_SCAN)
  )
}

/** Closes the open linked tasks once the ticket leaves processing (`ticket finish` rule). */
async function closeLinkedTasks(pms: PmsClient, record: PmsRecord, status: string): Promise<void> {
  const taskStatus = linkedTaskStatusFor(status)
  if (!taskStatus) {
    return
  }
  const ticketId = pmsField(record, 'id').replace(/^\d+x/, '')
  const tasks = await linkedTasks(pms, ticketId, projectOf(record), true)
  const today = localDate()
  await Promise.all(
    tasks.map((task) =>
      pms.openApi(
        'update',
        { module: 'ProjectTask' },
        {
          module: 'ProjectTask',
          record: task.id,
          data: { ...taskStatusFields(taskStatus, today), record: task.id }
        }
      )
    )
  )
}

async function saveChange(
  pms: PmsClient,
  ticketId: string,
  record: PmsRecord,
  data: TicketValues
): Promise<PmsTicketSaveResult> {
  const missing = prepareTicketChange(record, data)
  if (missing.length > 0) {
    return withOptions(missing)
  }
  await saveTicketData(pms, ticketId, data)
  if (data.ticketstatus) {
    await closeLinkedTasks(pms, { ...record, id: ticketId }, data.ticketstatus)
  }
  return { needs: null, detail: await getPmsItem({ kind: 'ticket', id: ticketId }) }
}

export async function savePmsTicket(input: unknown): Promise<PmsTicketSaveResult> {
  const args = SaveArgsSchema.parse(input)
  const pms = await connectedClient()
  const record = await retrieveTicket(pms, args.ticketId)
  const data: TicketValues = { ...args.fields }
  if (args.status) {
    data.ticketstatus = args.status
  }
  return saveChange(pms, args.ticketId, record, data)
}

export async function finishPmsTicket(input: unknown): Promise<PmsTicketSaveResult> {
  const args = FinishArgsSchema.parse(input)
  const pms = await connectedClient()
  const record = await retrieveTicket(pms, args.ticketId)
  const data: TicketValues = { ...args.fields, ticketstatus: args.status }
  const solution = finishSolution(args.cause, args.solution)
  if (solution) {
    data.solution = solution
  }
  if (args.gitCommit.trim()) {
    data.git_commit = args.gitCommit.trim()
  }
  return saveChange(pms, args.ticketId, record, data)
}

/**
 * `/pms ticket take`: In Progress, Người xử lý = me and Ngày dự kiến hoàn thành when empty, then a
 * ProjectTask linked to the ticket so time is logged on it. The form check runs before the task is
 * created, so a refused take leaves nothing behind.
 */
export async function takePmsTicket(input: unknown): Promise<PmsTakeResult> {
  const args = TakeArgsSchema.parse(input)
  const pms = await connectedClient()
  const record = await retrieveTicket(pms, args.ticketId)
  const values = ticketValues(record)
  const today = localDate()
  const data: TicketValues = { ...args.fields, ticketstatus: 'In Progress' }
  if (!(values.processing_user_id ?? '').replace(/^0$/, '') && !data.processing_user_id) {
    data.processing_user_id = pms.user?.id ?? ''
  }
  if (!(values.expected_doneline ?? '').trim() && !data.expected_doneline) {
    data.expected_doneline = (values.expected_date ?? '').trim() || addDays(today, 1)
  }
  const missing = prepareTicketChange(record, data)
  if (missing.length > 0) {
    return withOptions(missing)
  }

  let taskId: string | null = null
  if (args.createTask) {
    const created = await createLinkedTask(pms, args.ticketId, record, {
      title: '',
      taskType: args.taskType,
      endDate: data.expected_doneline || values.expected_doneline || addDays(today, 1)
    })
    if (typeof created !== 'string') {
      return created
    }
    taskId = created || null
  }

  await saveTicketData(pms, args.ticketId, data)
  return { needs: null, detail: await getPmsItem({ kind: 'ticket', id: args.ticketId }), taskId }
}

export async function pmsTicketTasks(ticketId: unknown): Promise<PmsLinkedTask[]> {
  const id = IdSchema.parse(ticketId)
  const pms = await connectedClient()
  const record = await retrieveTicket(pms, id)
  const tasks = await linkedTasks(pms, id, projectOf(record), false)
  return tasks.map(({ modified: _modified, ...task }) => task)
}
