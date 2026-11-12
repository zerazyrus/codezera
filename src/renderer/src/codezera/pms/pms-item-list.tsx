import React, { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PmsPicker, pmsStatusPicks } from './pms-picker'
import { cn } from '@/lib/class-names'
import type { PmsItem, PmsItemKind } from '../../../../shared/codezera/pms-types'
import { PmsDashboardView } from './pms-dashboard-view'
import { PmsReportView } from './pms-report-view'
import { PmsStatusBadge } from './pms-status-label'
import {
  PMS_ALL_EMPLOYEES,
  pmsErrorText,
  usePmsStore,
  type PmsListView as ListView
} from './pms-store'

const VIEW_KEY = 'codezera.pms.listView'

const ALL_STATUSES = '__all__'
/** The daily views of the `/pms` skill: what is waiting for me, what I am on. */
const DEFAULT_STATUS: Record<PmsItemKind, string> = { ticket: 'Assigned', task: 'In Progress' }

function PmsItemRow({
  item,
  onOpen
}: {
  item: PmsItem
  onOpen: (item: PmsItem) => void
}): React.JSX.Element {
  const options = usePmsStore((s) => s.statusOptions[item.kind])
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => onOpen(item)}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
          {item.number ? <span className="shrink-0 font-mono">{item.number}</span> : null}
          {item.number && item.projectLabel ? <span aria-hidden>·</span> : null}
          {item.projectLabel ? <span className="truncate">{item.projectLabel}</span> : null}
        </span>
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug font-medium text-foreground">
          {item.title}
        </span>
      </span>
      <PmsStatusBadge status={item.status} options={options} className="shrink-0" />
    </button>
  )
}

/** "My work" is the dashboard queue; Tickets/Tasks search every record the user owns. */
export function PmsItemList({
  onOpen,
  reloadKey,
  trailing
}: {
  onOpen: (item: PmsItem) => void
  reloadKey: number
  trailing: React.ReactNode
}): React.JSX.Element {
  const [view, setView] = useState<ListView>(
    () => (localStorage.getItem(VIEW_KEY) as ListView | null) ?? 'queue'
  )
  const requestedView = usePmsStore((s) => s.openRequest?.view)
  useEffect(() => {
    if (requestedView) {
      localStorage.setItem(VIEW_KEY, requestedView)
      setView(requestedView)
    }
  }, [requestedView])
  const viewOthers = usePmsStore((s) => s.viewOthers)
  const users = usePmsStore((s) => s.users)
  const loadUsers = usePmsStore((s) => s.loadUsers)
  const viewAs = usePmsStore((s) => s.viewAs)
  const setViewAs = usePmsStore((s) => s.setViewAs)
  const status = usePmsStore((s) => s.status)
  const me = status?.state === 'connected' ? { id: status.userId, name: status.userName } : null
  useEffect(() => {
    if (viewOthers) {
      void loadUsers().catch(() => undefined)
    }
  }, [viewOthers, loadUsers])
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 min-h-11 items-center gap-1 border-b border-border/50 px-4">
        {(['queue', 'ticket', 'task', 'report'] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={entry === view}
            onClick={() => {
              localStorage.setItem(VIEW_KEY, entry)
              setView(entry)
            }}
            className={cn(
              'relative h-11 px-2.5 text-sm transition-colors',
              entry === view
                ? 'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {entry === 'queue'
              ? translate('codezera.pms.myQueue', 'My work')
              : entry === 'ticket'
                ? translate('codezera.pms.tickets', 'Tickets')
                : entry === 'task'
                  ? translate('codezera.pms.tasks', 'Tasks')
                  : translate('codezera.pms.reports', 'Reports')}
          </button>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Reports are always the user's own timesheets. */}
          {viewOthers && me && view !== 'report' ? (
            <PmsPicker
              value={viewAs || me.id}
              onChange={(value) => setViewAs(value === me.id ? '' : value)}
              options={[
                { value: me.id, label: me.name },
                {
                  value: PMS_ALL_EMPLOYEES,
                  label: translate('codezera.pms.allEmployees', 'All employees')
                },
                ...(users ?? [])
                  .filter((user) => user.id !== me.id)
                  .map((user) => ({ value: user.id, label: user.name }))
              ]}
              ariaLabel={translate('codezera.pms.viewAs', 'Employee')}
              className="w-48 text-xs"
            />
          ) : null}
          {trailing}
        </div>
      </div>
      {view === 'queue' ? (
        <PmsDashboardView onOpen={onOpen} reloadKey={reloadKey} />
      ) : view === 'report' ? (
        <PmsReportView />
      ) : (
        <PmsRecordList key={view} kind={view} onOpen={onOpen} reloadKey={reloadKey} />
      )}
    </div>
  )
}

function PmsRecordList({
  kind,
  onOpen,
  reloadKey
}: {
  kind: PmsItemKind
  onOpen: (item: PmsItem) => void
  reloadKey: number
}): React.JSX.Element {
  const [status, setStatus] = useState<Record<PmsItemKind, string>>(DEFAULT_STATUS)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<PmsItem[]>([])
  const [total, setTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = usePmsStore((s) => s.statusOptions[kind])
  const loadStatusOptions = usePmsStore((s) => s.loadStatusOptions)
  const viewAs = usePmsStore((s) => s.viewAs)

  useEffect(() => {
    void loadStatusOptions(kind).catch(() => undefined)
  }, [kind, loadStatusOptions])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const statusFilter = status[kind] === ALL_STATUSES ? null : status[kind]
  const latestRequest = useRef(0)

  const load = async (offset: number): Promise<void> => {
    // A filter change while a request is in flight must not let the older result win.
    const request = ++latestRequest.current
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.codezera.pms.list({
        kind,
        status: statusFilter,
        search: query,
        offset,
        ownerId: viewAs || undefined
      })
      if (request !== latestRequest.current) {
        return
      }
      setItems((current) => (offset === 0 ? result.items : [...current, ...result.items]))
      setTotal(result.total)
      setNextOffset(result.nextOffset)
    } catch (err) {
      if (request === latestRequest.current) {
        setError(pmsErrorText(err))
      }
    } finally {
      if (request === latestRequest.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    setItems([])
    void load(0)
    // `load` reads exactly these inputs.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, statusFilter, query, viewAs, reloadKey])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              kind === 'ticket'
                ? translate('codezera.pms.searchTickets', 'Search title or #number')
                : translate('codezera.pms.searchTasks', 'Search title')
            }
            className="h-8 rounded-md border-border/50 bg-background pl-8 text-xs"
          />
        </div>
        <PmsPicker
          value={status[kind]}
          onChange={(value) => setStatus((current) => ({ ...current, [kind]: value }))}
          options={[
            { value: ALL_STATUSES, label: translate('codezera.pms.allStatuses', 'All statuses') },
            ...pmsStatusPicks(
              options?.map((option) => option.value) ?? [DEFAULT_STATUS[kind]],
              options
            )
          ]}
          className="w-44 shrink-0 text-xs"
        />
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
        {items.map((item) => (
          <PmsItemRow key={`${item.kind}-${item.id}`} item={item} onOpen={onOpen} />
        ))}
        {error ? <p className="px-4 py-3 text-xs break-words text-destructive">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {translate('codezera.pms.empty', 'Nothing here.')}
          </p>
        ) : null}
        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : nextOffset !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="my-1 w-full text-muted-foreground"
            onClick={() => void load(nextOffset)}
          >
            {translate('codezera.pms.loadMore', 'Load more ({{shown}} of {{total}})', {
              shown: items.length,
              total
            })}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
