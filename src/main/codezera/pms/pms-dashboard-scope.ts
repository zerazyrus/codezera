import { z } from 'zod'
import type {
  PmsDashboardFilters,
  PmsDashboardScope
} from '../../../shared/codezera/pms-dashboard-types'
import type { PmsClient } from './pms-client'
import { pmsField, pmsRecord, type PmsRecord } from './pms-records'
import { picklist } from './pms-service'
import { pmsWebSession } from './pms-web-session'

export const DashboardFiltersSchema = z.object({
  role: z.enum(['all', 'processing', 'verification', 'reception', 'owner']),
  /** An employee id, or empty for every employee; PMS ignores it unless the user is a dashboard manager. */
  user: z.union([z.string().regex(/^\d+$/), z.literal('')]).optional(),
  company: z.string().max(300),
  projectType: z.string().max(100),
  project: z.string().max(300)
})

/** The `filters` object of the Ticket Dashboard actions. */
function requestFilters(filters: PmsDashboardFilters): PmsRecord {
  return {
    role: filters.role,
    company: filters.company,
    project_type: filters.projectType,
    project: filters.project,
    ...(filters.user === undefined ? {} : { user: filters.user })
  }
}

/** One `HelpDesk/TicketDashboard` action under the filters; `extra` adds sections or drilldown params. */
export async function dashboardAction(
  pms: PmsClient,
  mode: 'getData' | 'getCompletedTickets' | 'getInflowTickets',
  filters: PmsDashboardFilters,
  extra: PmsRecord
): Promise<PmsRecord> {
  return pmsWebSession(pms).action({
    module: 'HelpDesk',
    action: 'TicketDashboard',
    mode,
    params: JSON.stringify({ filters: requestFilters(filters), ...extra })
  })
}

function strings(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value)
      : []
  return list.map(String)
}

/** The kept filter values and the choices `getData` returns next to every full load. */
export async function dashboardScope(result: PmsRecord): Promise<PmsDashboardScope> {
  const filters = pmsRecord(result.filters)
  const values = pmsRecord(filters.values)
  const options = pmsRecord(filters.options)
  const typeLabels = await picklist('HelpDesk', 'helpdesk_project_type').catch(() => [])
  return {
    company: pmsField(values, 'company'),
    projectType: pmsField(values, 'project_type'),
    project: pmsField(values, 'project'),
    companies: strings(options.companies),
    projectTypes: strings(options.project_types).map(
      (value) =>
        typeLabels.find((option) => option.value === value) ?? { value, label: value, color: null }
    ),
    projects: strings(options.projects),
    // PMS sends the employee options only to the managers it lets pick another employee.
    canViewOthers: Array.isArray(options.users)
  }
}
