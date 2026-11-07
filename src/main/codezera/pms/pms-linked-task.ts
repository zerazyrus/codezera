import { z } from 'zod'
import type { PmsCreateTaskResult, PmsStatusOption } from '../../../shared/codezera/pms-types'
import type { PmsClient } from './pms-client'
import { pmsField, pmsHtmlToText, type PmsRecord } from './pms-records'
import { connectedClient, IdSchema, localDate, picklist } from './pms-service'
import {
  linkedTaskDescription,
  taskPriorityForTicket,
  taskTypeForCategory,
  ticketValues
} from './pms-ticket-rules'

const CreateTaskArgsSchema = z.object({
  ticketId: IdSchema,
  title: z.string().max(255),
  taskType: z.string().min(1).max(100).nullable()
})

export function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + days)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
}

export async function retrieveTicket(pms: PmsClient, id: string): Promise<PmsRecord> {
  const payload = await pms.openApi('retrieve', { module: 'HelpDesk', record: id })
  const record = payload.data
  if (!record || typeof record !== 'object') {
    throw new Error(`PMS ticket ${id} was not found or you cannot view it.`)
  }
  return record as PmsRecord
}

export function projectOf(record: PmsRecord): string {
  const id = pmsField(record, 'related_project')
  return id && id !== '0' ? id : ''
}

/** A ProjectTask of mine linked to the ticket, in progress; returns its id or the type choices. */
export async function createLinkedTask(
  pms: PmsClient,
  ticketId: string,
  record: PmsRecord,
  options: { title: string; taskType: string | null; endDate: string }
): Promise<string | { needs: 'taskType'; options: PmsStatusOption[] }> {
  const values = ticketValues(record)
  const taskType = options.taskType ?? taskTypeForCategory(values.ticketcategories ?? '')
  if (!taskType) {
    return { needs: 'taskType', options: await picklist('ProjectTask', 'projecttasktype') }
  }
  const projectId = projectOf(record)
  if (!projectId) {
    throw new Error('This ticket has no project (Dự án); set it in PMS first.')
  }
  const today = localDate()
  const created = await pms.openApi(
    'create',
    { module: 'ProjectTask' },
    {
      module: 'ProjectTask',
      data: {
        projecttaskname:
          options.title.trim() || values.ticket_title || `Ticket ${values.ticket_no}`,
        projectid: projectId,
        projecttasktype: taskType,
        projecttaskpriority: taskPriorityForTicket(values.ticketpriorities ?? ''),
        projecttaskstatus: 'In Progress',
        projecttaskprogress: '0%',
        related_ticket: ticketId,
        assigned_user_id: `Users:${pms.user?.id ?? ''}`,
        start_date_plan: today,
        end_date_plan: options.endDate,
        description: linkedTaskDescription(values, pmsHtmlToText)
      }
    }
  )
  const payload = (created.data ?? {}) as PmsRecord
  return pmsField(created, 'record_id') || pmsField(payload, 'record_id') || pmsField(payload, 'id')
}

/** `/pms task create --ticket`: a new task under the ticket, e.g. to log time on it. */
export async function createPmsTicketTask(input: unknown): Promise<PmsCreateTaskResult> {
  const args = CreateTaskArgsSchema.parse(input)
  const pms = await connectedClient()
  const record = await retrieveTicket(pms, args.ticketId)
  const values = ticketValues(record)
  const today = localDate()
  const created = await createLinkedTask(pms, args.ticketId, record, {
    title: args.title,
    taskType: args.taskType,
    endDate: (values.expected_doneline ?? '').trim() || addDays(today, 1)
  })
  if (typeof created !== 'string') {
    return created
  }
  if (!created) {
    throw new Error('PMS did not return the new task id.')
  }
  return { needs: null, taskId: created }
}
