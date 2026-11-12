import React from 'react'
import { Ban, CalendarCheck, ExternalLink, Users, Zap } from 'lucide-react'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { cn } from '@/lib/class-names'
import type { PmsItem } from '../../../../shared/codezera/pms-types'
import { PMS_NO_PROJECT, type PmsQueueRow } from '../../../../shared/codezera/pms-dashboard-types'

export function pmsProjectLabel(project: string): string {
  return project === PMS_NO_PROJECT
    ? translate('codezera.pms.dashboard.noProject', 'No project')
    : project
}

export function priorityLabel(priority: string): string {
  switch (priority) {
    case 'Low':
      return translate('codezera.pms.priority.low', 'Low')
    case 'Normal':
      return translate('codezera.pms.priority.normal', 'Normal')
    case 'High':
      return translate('codezera.pms.priority.high', 'High')
    case 'Urgent':
      return translate('codezera.pms.priority.urgent', 'Urgent')
    default:
      return priority
  }
}

export function priorityTone(priority: string): string {
  switch (priority) {
    case 'Urgent':
      return 'border-destructive/40 bg-destructive/10 text-destructive'
    case 'High':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'Normal':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
    default:
      return 'border-border/60 bg-muted/40 text-muted-foreground'
  }
}

export function categoryLabel(category: string): string {
  switch (category) {
    case 'Bug':
      return translate('codezera.pms.category.bug', 'Bug')
    case 'Improve':
      return translate('codezera.pms.category.improve', 'Improvement')
    case 'support':
      return translate('codezera.pms.category.support', 'Support')
    default:
      return category
  }
}

/** The next step the PMS dashboard suggests for a ticket in this status. */
export function nextAction(status: string): string | null {
  switch (status) {
    case 'Open':
      return translate('codezera.pms.next.open', 'Verify and assign a handler')
    case 'Wait For Verifying':
      return translate('codezera.pms.next.verifying', 'Reproduce, record the cause')
    case 'Assigned':
      return translate('codezera.pms.next.assigned', 'Start, set the due date')
    case 'Reopen':
      return translate('codezera.pms.next.reopen', 'Read why it reopened, fix it')
    case 'In Progress':
      return translate('codezera.pms.next.inProgress', 'Fix, update progress')
    case 'Follow Up':
      return translate('codezera.pms.next.followUp', 'Check the result with the customer')
    case 'Wait For Response':
      return translate('codezera.pms.next.waitResponse', 'Remind the customer')
    case 'Pending':
      return translate('codezera.pms.next.pending', 'See why it is on hold')
    case 'Testing':
      return translate('codezera.pms.next.testing', 'Test the fix')
    case 'Pending Golive':
      return translate('codezera.pms.next.golive', 'Schedule the golive')
    case 'Wait Close':
      return translate('codezera.pms.next.waitClose', 'Wait for the customer to confirm')
    default:
      return null
  }
}

export type QuadrantStyle = {
  icon: typeof Zap
  title: string
  hint: string
  tone: string
}

export function quadrantStyle(key: string): QuadrantStyle {
  switch (key) {
    case 'do_now':
      return {
        icon: Zap,
        title: translate('codezera.pms.quadrant.doNow.title', 'Do now'),
        hint: translate('codezera.pms.quadrant.doNow.hint', 'Urgent and important'),
        tone: 'border-destructive/35 bg-destructive/8 text-destructive'
      }
    case 'plan':
      return {
        icon: CalendarCheck,
        title: translate('codezera.pms.quadrant.plan.title', 'Plan'),
        hint: translate('codezera.pms.quadrant.plan.hint', 'Important, not urgent'),
        tone: 'border-amber-500/35 bg-amber-500/8 text-amber-700 dark:text-amber-300'
      }
    case 'delegate':
      return {
        icon: Users,
        title: translate('codezera.pms.quadrant.delegate.title', 'Delegate'),
        hint: translate('codezera.pms.quadrant.delegate.hint', 'Urgent, not important'),
        tone: 'border-sky-500/35 bg-sky-500/8 text-sky-700 dark:text-sky-300'
      }
    default:
      return {
        icon: Ban,
        title: translate('codezera.pms.quadrant.limit.title', 'Limit'),
        hint: translate('codezera.pms.quadrant.limit.hint', 'Neither urgent nor important'),
        tone: 'border-border bg-muted/50 text-muted-foreground'
      }
  }
}

export function ticketUrl(baseUrl: string, id: string): string {
  return `${baseUrl}/index.php?module=HelpDesk&view=Detail&record=${encodeURIComponent(id)}`
}

export function toItem(row: PmsQueueRow, baseUrl: string): PmsItem {
  return {
    kind: 'ticket',
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    priority: row.priority,
    projectId: null,
    projectLabel: row.project || null,
    hours: 0,
    url: ticketUrl(baseUrl, row.id)
  }
}

export function DueText({
  row,
  className
}: {
  row: PmsQueueRow
  className?: string
}): React.JSX.Element {
  if (row.late) {
    return (
      <span className={cn('font-medium text-destructive', className)} title={row.due}>
        {translate('codezera.pms.lateDays', '{{days}}d late', { days: row.lateDays })}
      </span>
    )
  }
  if (!row.due) {
    return (
      <span className={cn('text-muted-foreground', className)}>
        {translate('codezera.pms.noDue', 'No due date')}
      </span>
    )
  }
  return (
    <span
      className={cn(row.soon ? 'text-amber-700 dark:text-amber-300' : 'text-foreground', className)}
    >
      {row.due}
    </span>
  )
}

export function IdleText({
  row,
  className
}: {
  row: PmsQueueRow
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'tabular-nums',
        row.stale ? 'text-destructive' : 'text-muted-foreground',
        className
      )}
      title={translate('codezera.pms.idleHint', 'Days since the last update')}
    >
      {translate('codezera.pms.days', '{{days}}d', { days: row.ageDays })}
    </span>
  )
}

export function ImportanceChip({ row }: { row: PmsQueueRow }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-2xs',
        row.important
          ? 'border-foreground/30 font-medium text-foreground'
          : 'border-border/60 text-muted-foreground'
      )}
    >
      {row.important
        ? translate('codezera.pms.important', 'Important')
        : translate('codezera.pms.notImportant', 'Not important')}
    </span>
  )
}

export function OpenInPms({
  row,
  baseUrl
}: {
  row: PmsQueueRow
  baseUrl: string
}): React.JSX.Element {
  const label = translate('codezera.pms.openInPms', 'Open in PMS')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground opacity-0 transition group-hover/row:opacity-100 focus-visible:opacity-100"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            openAppHttpLink(ticketUrl(baseUrl, row.id), { event })
          }}
        >
          <ExternalLink className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function RowHeading({ row }: { row: PmsQueueRow }): React.JSX.Element {
  const people = [row.receptionName, row.processingName].filter(Boolean)
  const uniquePeople = [...new Set(people)]
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
        <span className="shrink-0 font-mono">{row.number}</span>
        {row.project ? (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{row.project}</span>
          </>
        ) : null}
      </div>
      <h3 className="mt-0.5 line-clamp-2 text-[13px] leading-snug font-medium text-foreground">
        {row.title}
      </h3>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
        {row.category ? <span className="shrink-0">{categoryLabel(row.category)}</span> : null}
        {uniquePeople.length > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{uniquePeople.join(' → ')}</span>
          </>
        ) : null}
      </div>
      {row.missing.length > 0 ? (
        <p className="mt-1 text-2xs text-destructive">
          {translate('codezera.pms.missing', 'Missing: {{fields}}', {
            fields: row.missing.join(', ')
          })}
        </p>
      ) : null}
    </div>
  )
}
