import React, { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from './pms-i18n'
import { pmsProjectLabel } from './pms-queue-row-parts'
import { PmsStatusLabel } from './pms-status-label'
import { pmsErrorText, usePmsStore } from './pms-store'
import type { PmsItem } from '../../../../shared/codezera/pms-types'
import type {
  PmsDashboardCounts,
  PmsDashboardFilters,
  PmsDashboardMetric,
  PmsDashboardOverview,
  PmsDashboardScope
} from '../../../../shared/codezera/pms-dashboard-types'

const METRICS: PmsDashboardMetric[] = [
  'all',
  'late',
  'soon',
  'stale',
  'missing',
  'waitcus',
  'parked'
]

function metricLabel(metric: PmsDashboardMetric): string {
  switch (metric) {
    case 'late':
      return translate('codezera.pms.metric.late', 'Overdue')
    case 'soon':
      return translate('codezera.pms.metric.soon', 'Due soon')
    case 'stale':
      return translate('codezera.pms.metric.stale', 'Idle too long')
    case 'missing':
      return translate('codezera.pms.metric.missing', 'Missing info')
    case 'waitcus':
      return translate('codezera.pms.metric.waitcus', 'Waiting for customer')
    case 'parked':
      return translate('codezera.pms.metric.parked', 'On hold / Follow up')
    case 'all':
      return translate('codezera.pms.metric.all', 'To do')
  }
}

const METRIC_TONE: Partial<Record<PmsDashboardMetric, string>> = {
  late: 'text-destructive',
  soon: 'text-status-warning-text',
  stale: 'text-status-warning-text'
}

function GroupTable({
  title,
  rows,
  onPick
}: {
  title: string
  rows: { key: string; label: string; counts: PmsDashboardCounts }[]
  onPick: (key: string) => void
}): React.JSX.Element | null {
  if (rows.length === 0) {
    return null
  }
  return (
    <section className="rounded-lg border border-border/50">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <th className="px-3 py-2 text-left font-medium">{title}</th>
              {METRICS.map((metric) => (
                <th key={metric} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {metricLabel(metric)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((row) => (
              <tr
                key={row.key}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => onPick(row.key)}
              >
                <td className="max-w-80 truncate px-3 py-2">{row.label}</td>
                {METRICS.map((metric) => (
                  <td
                    key={metric}
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      row.counts[metric] === 0
                        ? 'text-muted-foreground/50'
                        : (METRIC_TONE[metric] ?? '')
                    )}
                  >
                    {row.counts[metric]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** "Tổng quan" of the Ticket Dashboard: open-ticket KPIs, status pipeline, categories and groups. */
export function PmsDashboardOverviewView({
  filters,
  onScope,
  reloadKey,
  onPickProject,
  onPickUser
}: {
  filters: PmsDashboardFilters
  onScope: (scope: PmsDashboardScope) => void
  onOpen: (item: PmsItem) => void
  reloadKey: number
  onPickProject: (project: string) => void
  onPickUser: (userId: string) => void
}): React.JSX.Element {
  const statusOptions = usePmsStore((s) => s.statusOptions.ticket)
  const loadStatusOptions = usePmsStore((s) => s.loadStatusOptions)
  const [data, setData] = useState<PmsDashboardOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  useEffect(() => {
    void loadStatusOptions('ticket').catch(() => undefined)
  }, [loadStatusOptions])

  useEffect(() => {
    const request = ++latestRequest.current
    setLoading(true)
    setError(null)
    window.api.codezera.pms
      .dashboardOverview(filters)
      .then((next) => {
        if (request === latestRequest.current) {
          setData(next)
          onScope(next.scope)
        }
      })
      .catch((err: unknown) => request === latestRequest.current && setError(pmsErrorText(err)))
      .finally(() => request === latestRequest.current && setLoading(false))
  }, [filters, reloadKey, onScope])

  const laneMax = Math.max(1, ...(data?.pipeline.map((lane) => lane.count) ?? []))
  const categoryMax = Math.max(1, ...(data?.categories.map((entry) => entry.count) ?? []))

  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
      {error ? <p className="px-4 py-3 text-xs break-words text-destructive">{error}</p> : null}
      {loading && !data ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {data ? (
        <div className={cn('flex flex-col gap-4 p-4', loading && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {METRICS.map((metric) => (
              <div key={metric} className="rounded-lg border border-border/50 px-3 py-2.5">
                <div className="truncate text-xs text-muted-foreground">{metricLabel(metric)}</div>
                <div
                  className={cn(
                    'mt-1 text-2xl font-semibold tabular-nums',
                    data.kpis[metric] > 0 && METRIC_TONE[metric]
                  )}
                >
                  {data.kpis[metric]}
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-border/50 p-3">
              <h3 className="mb-2 text-xs font-medium">
                {translate('codezera.pms.dashboard.pipeline', 'By status')}
              </h3>
              <div className="flex flex-col gap-1.5">
                {data.pipeline.map((lane) => (
                  <div key={lane.status} className="flex items-center gap-2 text-xs">
                    <PmsStatusLabel
                      status={lane.status}
                      options={statusOptions}
                      className="w-40 shrink-0 truncate"
                    />
                    <div className="h-2 min-w-0 flex-1 rounded-full bg-muted/60">
                      <div
                        className="h-2 rounded-full bg-foreground/60"
                        style={{ width: `${(lane.count / laneMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums">{lane.count}</span>
                    <span
                      className="w-28 text-right text-muted-foreground tabular-nums"
                      title={translate(
                        'codezera.pms.dashboard.medianHint',
                        'Median working days since the last update; idle tickets'
                      )}
                    >
                      {lane.count > 0
                        ? translate('codezera.pms.dashboard.median', '~{{days}}d', {
                            days: lane.medianDays
                          })
                        : ''}
                      {lane.stale > 0 ? (
                        <span className="ml-1.5 text-destructive">
                          {translate('codezera.pms.dashboard.staleCount', '{{count}} idle', {
                            count: lane.stale
                          })}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-border/50 p-3">
              <h3 className="mb-2 text-xs font-medium">
                {translate('codezera.pms.dashboard.categories', 'By category')}
              </h3>
              <div className="flex flex-col gap-1.5">
                {data.categories.map((entry) => (
                  <div key={entry.category} className="flex items-center gap-2 text-xs">
                    <span className="w-40 shrink-0 truncate">{entry.label || '—'}</span>
                    <div className="h-2 min-w-0 flex-1 rounded-full bg-muted/60">
                      <div
                        className="h-2 rounded-full bg-callout-note/70"
                        style={{ width: `${(entry.count / categoryMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums">{entry.count}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <GroupTable
            title={translate('codezera.pms.dashboard.byEmployee', 'Employee')}
            rows={data.byUser}
            onPick={onPickUser}
          />
          <GroupTable
            title={translate('codezera.pms.dashboard.byProject', 'Project')}
            rows={data.byProject.map((row) => ({ ...row, label: pmsProjectLabel(row.key) }))}
            onPick={onPickProject}
          />
        </div>
      ) : null}
    </div>
  )
}
