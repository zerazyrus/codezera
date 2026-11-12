import React, { useCallback, useMemo, useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/class-names'
import { translate } from './pms-i18n'
import { PmsPicker } from './pms-picker'
import { PmsQueueView } from './pms-queue-view'
import { PmsDashboardOverviewView } from './pms-dashboard-overview'
import { PmsDashboardReportView } from './pms-dashboard-report'
import { pmsProjectLabel } from './pms-queue-row-parts'
import { PMS_ALL_EMPLOYEES, storedChoice, usePmsStore } from './pms-store'
import type { PmsItem } from '../../../../shared/codezera/pms-types'
import type {
  PmsDashboardFilters,
  PmsDashboardScope,
  PmsQueueRole
} from '../../../../shared/codezera/pms-dashboard-types'

const SECTION_KEY = 'codezera.pms.dashboardSection'
const ROLE_KEY = 'codezera.pms.queueRole'
const ALL = '__all__'
const ROLES = ['all', 'processing', 'verification', 'reception', 'owner'] as const
const SECTIONS = ['overview', 'detail', 'report'] as const
type Section = (typeof SECTIONS)[number]

function roleLabel(role: PmsQueueRole, mine: boolean): string {
  switch (role) {
    case 'processing':
      return mine
        ? translate('codezera.pms.role.processing', 'I handle')
        : translate('codezera.pms.role.processingOf', 'Handles')
    case 'verification':
      return mine
        ? translate('codezera.pms.role.verification', 'I verify')
        : translate('codezera.pms.role.verificationOf', 'Verifies')
    case 'reception':
      return mine
        ? translate('codezera.pms.role.reception', 'I receive')
        : translate('codezera.pms.role.receptionOf', 'Receives')
    case 'owner':
      return mine
        ? translate('codezera.pms.role.owner', 'I own')
        : translate('codezera.pms.role.ownerOf', 'Owns')
    default:
      return mine
        ? translate('codezera.pms.role.all', 'All my roles')
        : translate('codezera.pms.role.allOf', 'All roles')
  }
}

/** "Việc của tôi": the PMS Ticket Dashboard — overview, ranked queue and report under one set of filters. */
export function PmsDashboardView({
  onOpen,
  reloadKey
}: {
  onOpen: (item: PmsItem) => void
  reloadKey: number
}): React.JSX.Element {
  const viewAs = usePmsStore((s) => s.viewAs)
  const setViewAs = usePmsStore((s) => s.setViewAs)
  const [section, setSection] = useState<Section>(() =>
    storedChoice(SECTION_KEY, SECTIONS, 'detail')
  )
  const [role, setRole] = useState<PmsQueueRole>(() => storedChoice(ROLE_KEY, ROLES, 'processing'))
  const [company, setCompany] = useState('')
  const [projectType, setProjectType] = useState('')
  const [project, setProject] = useState('')
  const [scope, setScope] = useState<PmsDashboardScope | null>(null)

  const filters = useMemo<PmsDashboardFilters>(
    () => ({
      role,
      company,
      projectType,
      project,
      ...(viewAs === '' ? {} : { user: viewAs === PMS_ALL_EMPLOYEES ? '' : viewAs })
    }),
    [role, company, projectType, project, viewAs]
  )

  const onScope = useCallback((next: PmsDashboardScope) => {
    setScope(next)
    // PMS drops a filter value without tickets left; follow it so the pickers show what applies.
    setCompany(next.company)
    setProjectType(next.projectType)
    setProject(next.project)
  }, [])

  const showSection = (next: Section): void => {
    localStorage.setItem(SECTION_KEY, next)
    setSection(next)
  }

  // PMS answers a non-manager asking for someone else with their own dashboard; never show it as theirs.
  const refused = viewAs !== '' && scope !== null && !scope.canViewOthers
  const sectionProps = { filters, onScope, onOpen, reloadKey }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border/50 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={section}
            onValueChange={(value) => {
              const next = SECTIONS.find((entry) => entry === value)
              if (next) {
                showSection(next)
              }
            }}
            aria-label={translate('codezera.pms.dashboard.sections', 'Dashboard view')}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="overview">
              {translate('codezera.pms.dashboard.overview', 'Overview')}
            </ToggleGroupItem>
            <ToggleGroupItem value="detail">
              {translate('codezera.pms.dashboard.detail', 'Detail')}
            </ToggleGroupItem>
            <ToggleGroupItem value="report">
              {translate('codezera.pms.dashboard.report', 'Report')}
            </ToggleGroupItem>
          </ToggleGroup>
          <PmsPicker
            value={company || ALL}
            onChange={(value) => setCompany(value === ALL ? '' : value)}
            options={[
              {
                value: ALL,
                label: translate('codezera.pms.dashboard.allCompanies', 'All companies')
              },
              ...(scope?.companies ?? []).map((name) => ({ value: name, label: name }))
            ]}
            ariaLabel={translate('codezera.pms.dashboard.company', 'Company')}
            className="w-48 text-xs"
          />
          <PmsPicker
            value={project || ALL}
            onChange={(value) => setProject(value === ALL ? '' : value)}
            options={[
              {
                value: ALL,
                label: translate('codezera.pms.dashboard.allProjects', 'All projects')
              },
              ...(scope?.projects ?? []).map((name) => ({
                value: name,
                label: pmsProjectLabel(name)
              }))
            ]}
            ariaLabel={translate('codezera.pms.dashboard.project', 'Project')}
            className="w-56 text-xs"
          />
          {scope && scope.projectTypes.length > 1 ? (
            <ToggleGroup
              type="single"
              value={projectType || ALL}
              onValueChange={(value) => value && setProjectType(value === ALL ? '' : value)}
              aria-label={translate('codezera.pms.dashboard.projectType', 'Project type')}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value={ALL}>
                {translate('codezera.pms.dashboard.allTypes', 'All')}
              </ToggleGroupItem>
              {scope.projectTypes.map((type) => (
                <ToggleGroupItem key={type.value} value={type.value}>
                  {type.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group">
          {ROLES.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={entry === role}
              onClick={() => {
                localStorage.setItem(ROLE_KEY, entry)
                setRole(entry)
              }}
              className={cn(
                'rounded-md border px-2 py-1 text-xs transition',
                entry === role
                  ? 'border-border/50 bg-foreground/90 text-background'
                  : 'border-border/50 bg-transparent text-foreground hover:bg-muted/50'
              )}
            >
              {roleLabel(entry, viewAs === '')}
            </button>
          ))}
        </div>
      </div>
      {refused ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {translate(
            'codezera.pms.queueOwnOnly',
            'PMS only shows you your own Ticket Dashboard. Ask a Ticket manager to add you to "Users who can see every employee" in the Ticket Dashboard settings; Tickets and Tasks still show this employee.'
          )}
        </p>
      ) : section === 'overview' ? (
        <PmsDashboardOverviewView
          {...sectionProps}
          onPickProject={(name) => {
            setProject(name)
            showSection('detail')
          }}
          onPickUser={(id) => {
            setViewAs(id)
            showSection('detail')
          }}
        />
      ) : section === 'report' ? (
        <PmsDashboardReportView {...sectionProps} />
      ) : (
        <PmsQueueView {...sectionProps} />
      )}
    </div>
  )
}
