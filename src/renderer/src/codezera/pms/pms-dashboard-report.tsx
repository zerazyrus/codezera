import React, { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { translate } from './pms-i18n'
import { PmsPicker } from './pms-picker'
import { pmsProjectLabel } from './pms-queue-row-parts'
import {
  bucketLabel,
  Card,
  Change,
  DrillDialog,
  groupLabel,
  periodLabel,
  ReportTable,
  type DrillQuery
} from './pms-dashboard-report-parts'
import { pmsErrorText, storedChoice, usePmsStore } from './pms-store'
import type { PmsItem } from '../../../../shared/codezera/pms-types'
import type {
  PmsDashboardFilters,
  PmsDashboardPeriod,
  PmsDashboardReport,
  PmsDashboardReportGroup,
  PmsDashboardReportRow,
  PmsDashboardScope
} from '../../../../shared/codezera/pms-dashboard-types'

const PERIOD_KEY = 'codezera.pms.reportPeriod'
const PERIODS: PmsDashboardPeriod[] = ['week', 'month', 'quarter', 'year']
const GROUPS: PmsDashboardReportGroup[] = ['person', 'project', 'category']

/** "Báo cáo" of the Ticket Dashboard: tickets created and completed per period, with drilldowns. */
export function PmsDashboardReportView({
  filters,
  onScope,
  onOpen,
  reloadKey
}: {
  filters: PmsDashboardFilters
  onScope: (scope: PmsDashboardScope) => void
  onOpen: (item: PmsItem) => void
  reloadKey: number
}): React.JSX.Element {
  const loadStatusOptions = usePmsStore((s) => s.loadStatusOptions)
  const [period, setPeriod] = useState<PmsDashboardPeriod>(() =>
    storedChoice(PERIOD_KEY, PERIODS, 'month')
  )
  const [picked, setPicked] = useState('')
  const [group, setGroup] = useState<PmsDashboardReportGroup>('person')
  const [data, setData] = useState<PmsDashboardReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<DrillQuery | null>(null)
  const latestRequest = useRef(0)

  useEffect(() => {
    void loadStatusOptions('ticket').catch(() => undefined)
  }, [loadStatusOptions])

  useEffect(() => {
    const request = ++latestRequest.current
    setLoading(true)
    setError(null)
    window.api.codezera.pms
      .dashboardReport({
        filters,
        period,
        picked
      })
      .then((next) => {
        if (request === latestRequest.current) {
          setData(next)
          onScope(next.scope)
        }
      })
      .catch((err: unknown) => request === latestRequest.current && setError(pmsErrorText(err)))
      .finally(() => request === latestRequest.current && setLoading(false))
  }, [filters, period, picked, reloadKey, onScope])

  const shown = data?.period === period ? data : null
  const trendMax = Math.max(
    1,
    ...(shown?.trend.flatMap((entry) => [entry.created, entry.completed]) ?? [])
  )
  const pickedLabel = shown ? bucketLabel(shown.picked) : ''
  const open = (
    source: DrillQuery['source'],
    state: DrillQuery['state'],
    title: string,
    row?: PmsDashboardReportRow
  ): void => {
    if (!shown) {
      return
    }
    setDrill({
      source,
      state,
      bucket: shown.picked,
      until: '',
      group: row ? group : '',
      key: row?.key ?? '',
      title: row ? `${title} · ${rowLabel(row)} · ${pickedLabel}` : `${title} · ${pickedLabel}`
    })
  }
  const rowLabel = (row: PmsDashboardReportRow): string =>
    group === 'project'
      ? pmsProjectLabel(row.key)
      : row.label ||
        (group === 'person'
          ? translate('codezera.pms.dashboard.noHolder', 'Nobody yet')
          : translate('codezera.pms.dashboard.noCategory', 'No category'))

  const rows = shown?.groups[group] ?? []
  const createdTitle = translate('codezera.pms.dashReport.created', 'Created')
  const completedTitle = translate('codezera.pms.dashReport.completed', 'Completed')
  const openTitle = translate('codezera.pms.dashReport.open', 'New, still open')
  const overdueTitle = translate('codezera.pms.dashReport.overdue', 'Overdue')
  const doneTitle = translate('codezera.pms.dashReport.done', 'Done')

  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(value) => {
            const next = PERIODS.find((entry) => entry === value)
            if (next) {
              localStorage.setItem(PERIOD_KEY, next)
              setPeriod(next)
              setPicked('')
            }
          }}
          aria-label={translate('codezera.pms.period.label', 'Period')}
          variant="outline"
          size="sm"
        >
          {PERIODS.map((entry) => (
            <ToggleGroupItem key={entry} value={entry}>
              {periodLabel(entry)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {shown ? (
          <>
            <PmsPicker
              value={shown.picked}
              onChange={setPicked}
              options={shown.buckets
                .toReversed()
                .map((bucket) => ({ value: bucket, label: bucketLabel(bucket) }))}
              ariaLabel={periodLabel(period)}
              className="w-32 text-xs"
            />
            <span className="text-xs text-muted-foreground">
              {translate(
                'codezera.pms.dashReport.compare',
                '{{picked}} vs the same span of {{previous}}',
                {
                  picked: pickedLabel,
                  previous: bucketLabel(shown.previous)
                }
              )}
            </span>
          </>
        ) : null}
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>
      {error ? <p className="px-4 py-3 text-xs break-words text-destructive">{error}</p> : null}
      {shown ? (
        <div className={cn('flex flex-col gap-4 p-4', loading && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Card
              title={createdTitle}
              value={shown.created}
              note={translate('codezera.pms.dashReport.previous', 'Same span before: {{count}}', {
                count: shown.previousCreated
              })}
              onClick={() => open('created', '', createdTitle)}
            >
              <Change now={shown.created} before={shown.previousCreated} />
            </Card>
            <Card
              title={completedTitle}
              value={shown.completed}
              note={translate('codezera.pms.dashReport.previous', 'Same span before: {{count}}', {
                count: shown.previousCompleted
              })}
              onClick={() => open('completed', '', completedTitle)}
            >
              <Change now={shown.completed} before={shown.previousCompleted} />
            </Card>
            <Card
              title={openTitle}
              value={shown.open}
              tone="text-amber-700 dark:text-amber-300"
              note={translate('codezera.pms.dashReport.openShare', '{{percent}}% of new tickets', {
                percent: shown.created ? Math.round((shown.open / shown.created) * 100) : 0
              })}
              onClick={() => open('created', 'open', openTitle)}
            />
            <Card
              title={overdueTitle}
              value={shown.overdue}
              tone="text-destructive"
              note={translate(
                'codezera.pms.dashReport.overdueHint',
                'New tickets still open past their due date'
              )}
              onClick={() => open('created', 'overdue', overdueTitle)}
            />
          </div>
          <section className="rounded-lg border border-border/50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <h3 className="font-medium">
                {translate(
                  'codezera.pms.dashReport.trend',
                  'Created and completed per {{period}}',
                  {
                    period: periodLabel(period).toLowerCase()
                  }
                )}
              </h3>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-muted-foreground/40" />
                  {createdTitle}
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-callout-note" />
                  {completedTitle}
                </span>
              </div>
            </div>
            <div className="flex h-44 items-end gap-1">
              {shown.trend.map((entry) => (
                <button
                  key={entry.bucket}
                  type="button"
                  onClick={() => setPicked(entry.bucket)}
                  className={cn(
                    'flex h-full min-w-0 flex-1 flex-col justify-end rounded-md border border-transparent px-0.5 pt-1 hover:bg-muted/40',
                    entry.bucket === shown.picked &&
                      'border-dashed border-callout-note/60 bg-callout-note/5'
                  )}
                >
                  <div className="flex min-h-0 flex-1 items-end justify-center gap-0.5">
                    {[
                      { value: entry.created, color: 'bg-muted-foreground/40' },
                      { value: entry.completed, color: 'bg-callout-note' }
                    ].map(({ value, color }) => (
                      <div key={color} className="flex h-full w-full max-w-5 flex-col justify-end">
                        <span className="text-center text-[10px] text-muted-foreground tabular-nums">
                          {value}
                        </span>
                        <div
                          className={cn('w-full rounded-t-sm', color)}
                          style={{ height: `${(value / trendMax) * 85}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <span
                    className={cn(
                      'mt-1 truncate text-center text-[10px] text-muted-foreground',
                      entry.bucket === shown.picked && 'font-medium text-callout-note'
                    )}
                  >
                    {bucketLabel(entry.bucket)}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-border/50">
            <div className="flex items-center gap-3 border-b border-border/50 px-3 py-2 text-xs">
              <span className="font-medium">{translate('codezera.pms.dashReport.by', 'By')}</span>
              {GROUPS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={entry === group}
                  onClick={() => setGroup(entry)}
                  className={cn(
                    'transition',
                    entry === group
                      ? 'font-medium text-foreground underline underline-offset-4'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {groupLabel(entry)}
                </button>
              ))}
              <span className="ml-auto text-muted-foreground">{pickedLabel}</span>
            </div>
            {group === 'person' && shown.standing ? (
              <p className="border-b border-border/50 bg-status-warning-background px-3 py-2 text-xs text-status-warning-text">
                {shown.standing.rank === 1
                  ? translate(
                      'codezera.pms.dashReport.standingFirst',
                      'You lead {{total}} people this period.',
                      {
                        total: shown.standing.total
                      }
                    )
                  : translate(
                      'codezera.pms.dashReport.standing',
                      'You rank {{rank}} of {{total}}, {{behind}} tickets behind the next place.',
                      shown.standing
                    )}
              </p>
            ) : null}
            <ReportTable
              group={group}
              rows={rows}
              rowLabel={rowLabel}
              open={open}
              titles={{
                created: createdTitle,
                completed: completedTitle,
                open: openTitle,
                overdue: overdueTitle,
                done: doneTitle
              }}
            />
          </section>
        </div>
      ) : null}
      <DrillDialog query={drill} filters={filters} onClose={() => setDrill(null)} onOpen={onOpen} />
    </div>
  )
}
