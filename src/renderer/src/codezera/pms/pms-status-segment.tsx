import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Clock, FileText, Loader2, RefreshCw } from 'lucide-react'
import { translate, usePmsCatalog } from './pms-i18n'
import { cn } from '@/lib/class-names'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { PmsItem, PmsItemDetail } from '../../../../shared/codezera/pms-types'
import { CloudGoIcon } from './CloudGoIcon'
import { PmsLogTimeForm } from './pms-log-time-form'
import { openPmsPage } from './pms-sidebar-shortcut'
import { pmsAvailable, pmsErrorText, pmsFormatHours, usePmsStore } from './pms-store'

const DAY_TARGET_HOURS = 7.5
const HOURS_REFRESH_MS = 10 * 60_000
const LISTED_TASKS = 6
const LISTED_TICKETS = 3

type Snapshot = { tasks: PmsItem[]; tickets: PmsItem[]; ticketTotal: number }

function ItemRow({
  item,
  logging,
  onOpen,
  onLog
}: {
  item: PmsItem
  logging?: boolean
  onOpen: () => void
  onLog?: () => void
}): React.JSX.Element {
  return (
    <div className="group flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent/60">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
        onClick={onOpen}
        title={item.title}
      >
        {item.number ? (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {item.number}
          </span>
        ) : null}
        <span className="truncate text-xs">{item.title}</span>
      </button>
      {onLog ? (
        <Button
          variant={logging ? 'secondary' : 'ghost'}
          size="xs"
          className="h-6 shrink-0 gap-1 px-1.5 text-[11px]"
          onClick={onLog}
        >
          <Clock className="size-3" />
          {translate('codezera.pms.statusBar.log', 'Log')}
        </Button>
      ) : null}
    </div>
  )
}

/** Status bar PMS entry: today's logged hours, plus quick log time / open / report from anywhere. */
export function PmsStatusSegment({ compact }: { compact: boolean }): React.JSX.Element | null {
  usePmsCatalog()
  const status = usePmsStore((s) => s.status)
  const loadStatus = usePmsStore((s) => s.loadStatus)
  const todayHours = usePmsStore((s) => s.todayHours)
  const refreshTodayHours = usePmsStore((s) => s.refreshTodayHours)
  const connected = status?.state === 'connected'
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logTarget, setLogTarget] = useState<{ id: string; detail: PmsItemDetail | null } | null>(
    null
  )

  useEffect(() => {
    if (pmsAvailable() && !status) {
      void loadStatus().catch(() => undefined)
    }
  }, [status, loadStatus])

  useEffect(() => {
    if (!connected) {
      return
    }
    void refreshTodayHours().catch(() => undefined)
    const timer = setInterval(
      () => void refreshTodayHours().catch(() => undefined),
      HOURS_REFRESH_MS
    )
    return () => clearInterval(timer)
  }, [connected, refreshTodayHours])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [tasks, tickets] = await Promise.all([
        window.api.codezera.pms.list({
          kind: 'task',
          status: 'In Progress',
          search: '',
          offset: 0
        }),
        window.api.codezera.pms.list({ kind: 'ticket', status: 'Assigned', search: '', offset: 0 }),
        refreshTodayHours()
      ])
      setSnapshot({
        tasks: tasks.items.slice(0, LISTED_TASKS),
        tickets: tickets.items.slice(0, LISTED_TICKETS),
        ticketTotal: tickets.total
      })
    } catch (err) {
      setError(pmsErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [refreshTodayHours])

  if (!pmsAvailable() || !connected) {
    return null
  }

  const startLog = (item: PmsItem): void => {
    if (logTarget?.id === item.id) {
      setLogTarget(null)
      return
    }
    setLogTarget({ id: item.id, detail: null })
    window.api.codezera.pms
      .getItem({ kind: 'task', id: item.id })
      .then((detail) =>
        setLogTarget((current) => (current?.id === item.id ? { id: item.id, detail } : current))
      )
      .catch((err) => {
        setLogTarget(null)
        setError(pmsErrorText(err))
      })
  }

  const go = (request: Parameters<typeof openPmsPage>[0]): void => {
    setOpen(false)
    openPmsPage(request)
  }

  const short = todayHours !== null && todayHours < DAY_TARGET_HOURS
  const hoursLabel = todayHours === null ? '–' : pmsFormatHours(todayHours)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          void load()
        } else {
          setLogTarget(null)
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-accent/70"
          aria-label={translate('codezera.pms.statusBar.label', 'CloudGO PMS: today')}
          title={translate('codezera.pms.statusBar.tooltip', 'PMS · hours logged today')}
        >
          <CloudGoIcon className="size-3 shrink-0" />
          <span className={cn('tabular-nums', short && 'text-amber-600 dark:text-amber-400')}>
            {compact ? hoursLabel : `${hoursLabel} / 7h30`}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[26rem] p-0">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <span className="text-sm font-medium">
            {translate('codezera.pms.statusBar.today', 'Today')}
          </span>
          <span
            className={cn(
              'text-sm tabular-nums',
              short
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {hoursLabel} / 7h30
          </span>
          <div className="ml-auto flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate('codezera.pms.refresh', 'Refresh')}
              onClick={() => void load()}
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        <div className="scrollbar-sleek max-h-[60vh] overflow-y-auto px-1.5 py-2">
          {error ? <p className="px-1.5 pb-2 text-xs text-destructive">{error}</p> : null}

          <div className="px-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {translate('codezera.pms.statusBar.inProgress', 'In progress')}
          </div>
          {snapshot && snapshot.tasks.length === 0 ? (
            <p className="px-1.5 pb-1 text-xs text-muted-foreground">
              {translate('codezera.pms.statusBar.noTasks', 'No task in progress.')}
            </p>
          ) : null}
          {snapshot?.tasks.map((task) => (
            <div key={task.id}>
              <ItemRow
                item={task}
                logging={logTarget?.id === task.id}
                onOpen={() => go({ view: 'task', item: task })}
                onLog={() => startLog(task)}
              />
              {logTarget?.id === task.id ? (
                <div className="mx-1.5 mb-2 rounded-md border border-border/60 bg-muted/30 p-2">
                  {logTarget.detail ? (
                    <PmsLogTimeForm
                      item={logTarget.detail}
                      onDone={() => {
                        setLogTarget(null)
                        void load()
                      }}
                    />
                  ) : (
                    <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              ) : null}
            </div>
          ))}

          <div className="mt-2 flex items-center px-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {translate('codezera.pms.statusBar.assigned', 'Assigned to me')}
            {snapshot ? <span className="ml-1 tabular-nums">({snapshot.ticketTotal})</span> : null}
          </div>
          {snapshot && snapshot.tickets.length === 0 ? (
            <p className="px-1.5 pb-1 text-xs text-muted-foreground">
              {translate('codezera.pms.statusBar.noTickets', 'No ticket waiting.')}
            </p>
          ) : null}
          {snapshot?.tickets.map((ticket) => (
            <ItemRow
              key={ticket.id}
              item={ticket}
              onOpen={() => go({ view: 'queue', item: ticket })}
            />
          ))}
          {snapshot && snapshot.ticketTotal > snapshot.tickets.length ? (
            <button
              type="button"
              className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              onClick={() => go({ view: 'queue' })}
            >
              {translate('codezera.pms.statusBar.allWork', 'All my work')}
              <ChevronRight className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => go({ view: 'report' })}
          >
            <FileText className="size-3.5" />
            {translate('codezera.pms.statusBar.report', 'Daily report')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => go({ view: 'queue' })}
          >
            {translate('codezera.pms.statusBar.openPms', 'Open PMS')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
