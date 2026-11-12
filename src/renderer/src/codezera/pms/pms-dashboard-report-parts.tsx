import React, { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/class-names'
import { translate } from './pms-i18n'
import { ticketUrl } from './pms-queue-row-parts'
import { Pager } from './pms-queue-sections'
import { PmsStatusBadge } from './pms-status-label'
import { pmsErrorText, usePmsStore } from './pms-store'
import type { PmsItem } from '../../../../shared/codezera/pms-types'
import type {
  PmsDashboardDrill,
  PmsDashboardDrillArgs,
  PmsDashboardFilters,
  PmsDashboardPeriod,
  PmsDashboardReportGroup,
  PmsDashboardReportRow
} from '../../../../shared/codezera/pms-dashboard-types'

export type DrillQuery = Omit<PmsDashboardDrillArgs, 'filters' | 'page'> & { title: string }

export type ReportTitles = {
  created: string
  completed: string
  open: string
  overdue: string
  done: string
}

/** 2026-Q4 → Q4/26, 2026-10 → 10/26, 2026-W42 → W42/26, 2026 → 2026. */
export function bucketLabel(bucket: string): string {
  const [year, part] = bucket.split('-')
  return part ? `${part}/${year.slice(2)}` : bucket
}

export function periodLabel(period: PmsDashboardPeriod): string {
  switch (period) {
    case 'week':
      return translate('codezera.pms.period.week', 'Week')
    case 'quarter':
      return translate('codezera.pms.period.quarter', 'Quarter')
    case 'year':
      return translate('codezera.pms.period.year', 'Year')
    case 'month':
      return translate('codezera.pms.period.month', 'Month')
  }
}

export function groupLabel(group: PmsDashboardReportGroup): string {
  return group === 'person'
    ? translate('codezera.pms.dashboard.byEmployee', 'Employee')
    : group === 'project'
      ? translate('codezera.pms.dashboard.byProject', 'Project')
      : translate('codezera.pms.dashboard.byCategory', 'Category')
}

export function Change({ now, before }: { now: number; before: number }): React.JSX.Element | null {
  if (before === 0 || now === before) {
    return null
  }
  const up = now > before
  return (
    <span className="ml-1.5 inline-flex items-center text-[11px] text-muted-foreground">
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.round((Math.abs(now - before) / before) * 100)}%
    </span>
  )
}

export function Card({
  title,
  value,
  note,
  tone,
  onClick,
  children
}: {
  title: string
  value: number
  note: string
  tone?: string
  onClick: () => void
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border/50 px-3 py-2.5 text-left transition hover:bg-muted/40"
    >
      <div className={cn('text-xs text-muted-foreground', tone)}>{title}</div>
      <div className="mt-1 flex items-baseline">
        <span className={cn('text-2xl font-semibold tabular-nums', tone)}>{value}</span>
        {children}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{note}</div>
    </button>
  )
}

function Num({
  value,
  onClick,
  className
}: {
  value: number
  onClick: () => void
  className?: string
}): React.JSX.Element {
  return value === 0 ? (
    <span className="text-muted-foreground/50">0</span>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={cn('tabular-nums underline-offset-2 hover:underline', className)}
    >
      {value}
    </button>
  )
}

/** Created/completed per employee, project or category in the picked period; every count drills down. */
export function ReportTable({
  group,
  rows,
  rowLabel,
  open,
  titles
}: {
  group: PmsDashboardReportGroup
  rows: PmsDashboardReportRow[]
  rowLabel: (row: PmsDashboardReportRow) => string
  open: (
    source: DrillQuery['source'],
    state: DrillQuery['state'],
    title: string,
    row?: PmsDashboardReportRow
  ) => void
  titles: ReportTitles
}): React.JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border/50">
            <th className="px-3 py-2 text-left font-medium" rowSpan={2}>
              {groupLabel(group)}
            </th>
            <th className="border-l border-border/50 px-3 pt-2 font-medium" colSpan={5}>
              {translate('codezera.pms.dashReport.createdInPeriod', 'Created in the period')}
            </th>
            <th className="border-l border-border/50 px-3 pt-2 font-medium" colSpan={2}>
              {translate('codezera.pms.dashReport.completedInPeriod', 'Completed in the period')}
            </th>
            <th className="border-l border-border/50 px-3 py-2 font-medium" rowSpan={2}>
              {translate('codezera.pms.dashReport.backlog', 'Backlog change')}
            </th>
          </tr>
          <tr className="border-b border-border/50 [&>th]:px-3 [&>th]:py-1.5 [&>th]:text-right [&>th]:font-normal">
            <th className="border-l border-border/50">
              {translate('codezera.pms.dashReport.total', 'Total')}
            </th>
            <th>{titles.done}</th>
            <th>{translate('codezera.pms.dashReport.stillOpen', 'Open')}</th>
            <th>{titles.overdue}</th>
            <th>{translate('codezera.pms.dashReport.doneRate', 'Done rate')}</th>
            <th className="border-l border-border/50">
              {translate('codezera.pms.dashReport.tickets', 'Tickets')}
            </th>
            <th>{translate('codezera.pms.dashReport.vsBefore', '± before')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row) => {
            const rate = row.created ? Math.round((row.done / row.created) * 100) : 0
            const delta = row.completed - row.previousCompleted
            const backlog = row.created - row.completed
            return (
              <tr key={row.key} className="[&>td]:px-3 [&>td]:py-2 [&>td]:text-right">
                <td className="max-w-64 truncate !text-left">{rowLabel(row)}</td>
                <td className="border-l border-border/50">
                  <Num
                    value={row.created}
                    onClick={() => open('created', '', titles.created, row)}
                  />
                </td>
                <td>
                  <Num value={row.done} onClick={() => open('created', 'done', titles.done, row)} />
                </td>
                <td>
                  <Num
                    value={row.open}
                    className="text-status-warning-text"
                    onClick={() => open('created', 'open', titles.open, row)}
                  />
                </td>
                <td>
                  <Num
                    value={row.overdue}
                    className="text-destructive"
                    onClick={() => open('created', 'overdue', titles.overdue, row)}
                  />
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-muted/60">
                      <div
                        className="h-1.5 rounded-full bg-callout-note"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className="w-8 tabular-nums">{rate}%</span>
                  </div>
                </td>
                <td className="border-l border-border/50">
                  <Num
                    value={row.completed}
                    className="font-medium text-callout-note"
                    onClick={() => open('completed', '', titles.completed, row)}
                  />
                </td>
                <td
                  className={cn(
                    'tabular-nums',
                    delta > 0 ? 'text-status-success' : delta < 0 && 'text-destructive'
                  )}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </td>
                <td
                  className={cn(
                    'border-l border-border/50 tabular-nums',
                    backlog > 0 ? 'text-destructive' : backlog < 0 && 'text-status-success'
                  )}
                  title={translate(
                    'codezera.pms.dashReport.backlogHint',
                    '{{created}} created, {{completed}} completed',
                    row
                  )}
                >
                  {backlog > 0 ? `+${backlog}` : backlog}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {translate('codezera.pms.empty', 'Nothing here.')}
        </p>
      ) : null}
    </div>
  )
}

function DrillContent({
  query,
  filters,
  onClose,
  onOpen
}: {
  query: DrillQuery
  filters: PmsDashboardFilters
  onClose: () => void
  onOpen: (item: PmsItem) => void
}): React.JSX.Element {
  const status = usePmsStore((s) => s.status)
  const statusOptions = usePmsStore((s) => s.statusOptions.ticket)
  const baseUrl = status?.state === 'connected' ? status.baseUrl : ''
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PmsDashboardDrill | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  useEffect(() => {
    const request = ++latestRequest.current
    setError(null)
    window.api.codezera.pms
      .dashboardDrill({
        filters,
        source: query.source,
        bucket: query.bucket,
        until: query.until,
        state: query.state,
        group: query.group,
        key: query.key,
        page
      })
      .then((next) => request === latestRequest.current && setData(next))
      .catch((err: unknown) => request === latestRequest.current && setError(pmsErrorText(err)))
  }, [query, filters, page])

  return (
    <>
      <DialogTitle size="compact">{query.title}</DialogTitle>
      <DialogDescription size="compact">
        {data
          ? translate('codezera.pms.dashboard.drillTotal', '{{count}} tickets', {
              count: data.total
            })
          : ' '}
      </DialogDescription>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="scrollbar-sleek min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
        {data === null && !error ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {data?.rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-muted/40"
            onClick={() => {
              onClose()
              onOpen({
                kind: 'ticket',
                id: row.id,
                number: row.number,
                title: row.title,
                status: row.status,
                priority: '',
                projectId: null,
                projectLabel: row.project || null,
                hours: 0,
                url: ticketUrl(baseUrl, row.id)
              })
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-muted-foreground">
                {row.number}
                {row.project ? ` · ${row.project}` : ''}
              </div>
              <div className="truncate text-xs">{row.title}</div>
            </div>
            <PmsStatusBadge status={row.status} options={statusOptions} />
          </button>
        ))}
      </div>
      {data && data.total > data.pageSize ? (
        <div className="flex justify-end">
          <Pager
            page={data.page}
            pageCount={Math.ceil(data.total / data.pageSize)}
            onPage={setPage}
          />
        </div>
      ) : null}
    </>
  )
}

/** The tickets behind one report count; opening one closes the dialog and shows the drawer. */
export function DrillDialog({
  query,
  filters,
  onClose,
  onOpen
}: {
  query: DrillQuery | null
  filters: PmsDashboardFilters
  onClose: () => void
  onOpen: (item: PmsItem) => void
}): React.JSX.Element {
  return (
    <Dialog open={query !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100vh-6rem)] flex-col sm:max-w-2xl">
        {query ? (
          // A new count starts again at page 1.
          <DrillContent
            key={[query.source, query.state, query.bucket, query.group, query.key].join('|')}
            query={query}
            filters={filters}
            onClose={onClose}
            onOpen={onOpen}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
