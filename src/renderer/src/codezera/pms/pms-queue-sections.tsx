import React, { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/class-names'
import type { PmsItem } from '../../../../shared/codezera/pms-types'
import type {
  PmsQueue,
  PmsQueueBucket,
  PmsQueueRow
} from '../../../../shared/codezera/pms-dashboard-types'
import { PmsStatusBadge } from './pms-status-label'
import { usePmsStore } from './pms-store'
import {
  priorityLabel,
  priorityTone,
  nextAction,
  quadrantStyle,
  toItem,
  DueText,
  IdleText,
  ImportanceChip,
  OpenInPms,
  RowHeading
} from './pms-queue-row-parts'

// Desktop columns: ticket, status, priority, next step, due, idle, actions.
export const LIST_COLUMNS =
  '@4xl:grid-cols-[minmax(0,1fr)_8.5rem_13rem_minmax(0,12rem)_7rem_5rem_2rem] @4xl:gap-4'

/** A dashboard row: full columns on wide panes, a stacked summary when the detail pane is open. */
export function ListRow({
  row,
  baseUrl,
  onOpen
}: {
  row: PmsQueueRow
  baseUrl: string
  onOpen: () => void
}): React.JSX.Element {
  const options = usePmsStore((s) => s.statusOptions.ticket)
  const action = nextAction(row.status)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group/row grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
        LIST_COLUMNS
      )}
    >
      <div className="min-w-0">
        <RowHeading row={row} />
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-2xs @4xl:!hidden">
          <PmsStatusBadge status={row.status} options={options} className="text-2xs" />
          <span className={cn('rounded-md border px-1.5 py-0.5', priorityTone(row.priority))}>
            {priorityLabel(row.priority)}
          </span>
          <DueText row={row} />
          {action ? <span className="truncate text-muted-foreground">→ {action}</span> : null}
        </div>
      </div>
      <div className="min-w-0 @max-4xl:!hidden">
        <PmsStatusBadge status={row.status} options={options} />
      </div>
      <div className="flex min-w-0 flex-wrap gap-1 @max-4xl:!hidden">
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-2xs font-medium',
            priorityTone(row.priority)
          )}
        >
          {priorityLabel(row.priority)}
        </span>
        <ImportanceChip row={row} />
      </div>
      <span className="min-w-0 text-xs text-foreground @max-4xl:!hidden">{action ?? '—'}</span>
      <DueText row={row} className="text-xs @max-4xl:!hidden" />
      <IdleText row={row} className="text-right text-xs @max-4xl:!hidden" />
      <div className="flex justify-end">
        <OpenInPms row={row} baseUrl={baseUrl} />
      </div>
    </div>
  )
}

export function ListHeader(): React.JSX.Element {
  const cell = 'text-2xs font-semibold tracking-wider text-muted-foreground uppercase'
  return (
    <div
      className={cn(
        'sticky top-0 z-10 grid items-center border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur @max-4xl:!hidden',
        LIST_COLUMNS
      )}
    >
      <span className={cell}>{translate('codezera.pms.col.ticket', 'Ticket')}</span>
      <span className={cell}>{translate('codezera.pms.col.status', 'Status')}</span>
      <span className={cell}>
        {translate('codezera.pms.col.priority', 'Priority / importance')}
      </span>
      <span className={cell}>{translate('codezera.pms.col.next', 'Next step')}</span>
      <span className={cell}>{translate('codezera.pms.col.due', 'Due')}</span>
      <span className={cn(cell, 'text-right')}>{translate('codezera.pms.col.idle', 'Idle')}</span>
      <span />
    </div>
  )
}

/** A compact card for the Eisenhower grid, where columns would not fit. */
export function QuadrantRow({
  row,
  baseUrl,
  onOpen
}: {
  row: PmsQueueRow
  baseUrl: string
  onOpen: () => void
}): React.JSX.Element {
  const options = usePmsStore((s) => s.statusOptions.ticket)
  const action = nextAction(row.status)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onOpen()
        }
      }}
      className="group/row flex cursor-pointer gap-3 rounded-md border border-border/60 bg-background px-3 py-2.5 transition hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="min-w-0 flex-1">
        <RowHeading row={row} />
        {action ? <p className="mt-1 truncate text-2xs text-muted-foreground">→ {action}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-2xs">
        <PmsStatusBadge status={row.status} options={options} className="text-2xs" />
        <DueText row={row} />
        <OpenInPms row={row} baseUrl={baseUrl} />
      </div>
    </div>
  )
}

export function Pager({
  page,
  pageCount,
  onPage
}: {
  page: number
  pageCount: number
  onPage: (page: number) => void
}): React.JSX.Element | null {
  if (pageCount <= 1) {
    return null
  }
  return (
    <span className="flex items-center gap-0.5 text-xs tabular-nums">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={page <= 1}
        aria-label={translate('codezera.pms.prevPage', 'Previous page')}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="size-3.5" />
      </Button>
      {page}/{pageCount}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={page >= pageCount}
        aria-label={translate('codezera.pms.nextPage', 'Next page')}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </span>
  )
}

export function Quadrant({
  queue,
  bucket,
  page,
  onPage,
  onOpen,
  baseUrl
}: {
  queue: PmsQueue
  bucket: PmsQueueBucket
  page: number
  onPage: (page: number) => void
  onOpen: (item: PmsItem) => void
  baseUrl: string
}): React.JSX.Element {
  const style = quadrantStyle(bucket.key)
  const Icon = style.icon
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5', style.tone)}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background/80">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold">{style.title}</h4>
          <p className="truncate text-2xs opacity-80">{style.hint}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-xl leading-none font-semibold tabular-nums">{bucket.total}</span>
          {bucket.late > 0 ? (
            <span className="mt-1 text-2xs font-medium text-destructive">
              {translate('codezera.pms.lateCount', '{{count}} late', { count: bucket.late })}
            </span>
          ) : null}
        </div>
      </header>
      {bucket.rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-3 text-center text-xs text-muted-foreground">
          {translate('codezera.pms.quadrantEmpty', 'No tickets')}
        </p>
      ) : (
        bucket.rows.map((row) => (
          <QuadrantRow
            key={row.id}
            row={row}
            baseUrl={baseUrl}
            onOpen={() => onOpen(toItem(row, baseUrl))}
          />
        ))
      )}
      <div className="flex justify-end empty:hidden">
        <Pager page={page} pageCount={Math.ceil(bucket.total / queue.pageSize)} onPage={onPage} />
      </div>
    </section>
  )
}

export function ProjectGroup({
  bucket,
  onOpen,
  baseUrl
}: {
  bucket: PmsQueueBucket
  onOpen: (item: PmsItem) => void
  baseUrl: string
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 border-b border-border/50 bg-muted/35 px-4 text-left transition-colors hover:bg-accent"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
            {bucket.key || translate('codezera.pms.noProject', 'No project')}
          </span>
          <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
            {bucket.total}
          </span>
          {bucket.late > 0 ? (
            <span className="shrink-0 text-2xs font-medium text-destructive">
              {translate('codezera.pms.lateCount', '{{count}} late', { count: bucket.late })}
            </span>
          ) : null}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="divide-y divide-border/50 border-b border-border/50">
        {bucket.rows.map((row) => (
          <ListRow
            key={row.id}
            row={row}
            baseUrl={baseUrl}
            onOpen={() => onOpen(toItem(row, baseUrl))}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
