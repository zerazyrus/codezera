import React, { useEffect, useRef, useState } from 'react'
import { FolderKanban, Grid2x2, List, Loader2, Search } from 'lucide-react'
import { translate } from './pms-i18n'
import { Input } from '@/components/ui/input'
import { PmsPicker, pmsStatusPicks } from './pms-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type {
  PmsItem,
  PmsQuadrant,
  PmsQueue,
  PmsQueueLayout,
  PmsQueueRole
} from '../../../../shared/codezera/pms-types'
import { pmsErrorText, usePmsStore } from './pms-store'
import { toItem } from './pms-queue-row-parts'
import { ListRow, ListHeader, Pager, Quadrant, ProjectGroup } from './pms-queue-sections'

const ROLE_KEY = 'codezera.pms.queueRole'
const LAYOUT_KEY = 'codezera.pms.queueLayout'
const ALL_STATUSES = '__all__'
const ROLES = ['all', 'processing', 'verification', 'reception', 'owner'] as const

function roleLabel(role: PmsQueueRole): string {
  switch (role) {
    case 'processing':
      return translate('codezera.pms.role.processing', 'I handle')
    case 'verification':
      return translate('codezera.pms.role.verification', 'I verify')
    case 'reception':
      return translate('codezera.pms.role.reception', 'I receive')
    case 'owner':
      return translate('codezera.pms.role.owner', 'I own')
    default:
      return translate('codezera.pms.role.all', 'All my roles')
  }
}

/** "Việc của tôi": the PMS Ticket Dashboard queue, filtered by the role the user plays on each ticket. */
export function PmsQueueView({
  onOpen,
  reloadKey
}: {
  onOpen: (item: PmsItem) => void
  reloadKey: number
}): React.JSX.Element {
  const status = usePmsStore((s) => s.status)
  const options = usePmsStore((s) => s.statusOptions.ticket)
  const loadStatusOptions = usePmsStore((s) => s.loadStatusOptions)
  const baseUrl = status?.state === 'connected' ? status.baseUrl : ''
  const [role, setRole] = useState<PmsQueueRole>(
    () => (localStorage.getItem(ROLE_KEY) as PmsQueueRole | null) ?? 'processing'
  )
  const [layout, setLayout] = useState<PmsQueueLayout>(
    () => (localStorage.getItem(LAYOUT_KEY) as PmsQueueLayout | null) ?? 'eisenhower'
  )
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [quadrantPages, setQuadrantPages] = useState<Partial<Record<PmsQuadrant, number>>>({})
  const [queue, setQueue] = useState<PmsQueue | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  useEffect(() => {
    void loadStatusOptions('ticket').catch(() => undefined)
  }, [loadStatusOptions])

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
    setQuadrantPages({})
  }, [role, layout, statusFilter, keyword])

  useEffect(() => {
    const request = ++latestRequest.current
    setLoading(true)
    setError(null)
    window.api.codezera.pms
      .queue({
        role,
        layout,
        keyword,
        status: statusFilter === ALL_STATUSES ? '' : statusFilter,
        page,
        quadrantPages
      })
      .then((next) => request === latestRequest.current && setQueue(next))
      .catch((err: unknown) => request === latestRequest.current && setError(pmsErrorText(err)))
      .finally(() => request === latestRequest.current && setLoading(false))
  }, [role, layout, statusFilter, keyword, page, quadrantPages, reloadKey])

  // The previous layout's buckets render wrongly in the new one until its data arrives.
  const shown = queue?.layout === layout ? queue : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border/50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
                {roleLabel(entry)}
              </button>
            ))}
          </div>
          <ToggleGroup
            type="single"
            value={layout}
            onValueChange={(value) => {
              if (value === 'list' || value === 'project' || value === 'eisenhower') {
                localStorage.setItem(LAYOUT_KEY, value)
                setLayout(value)
              }
            }}
            aria-label={translate('codezera.pms.layout.label', 'Queue layout')}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="list">
              <List />
              {translate('codezera.pms.layout.list', 'List')}
            </ToggleGroupItem>
            <ToggleGroupItem value="project">
              <FolderKanban />
              {translate('codezera.pms.layout.project', 'By project')}
            </ToggleGroupItem>
            <ToggleGroupItem value="eisenhower">
              <Grid2x2 />
              {translate('codezera.pms.layout.eisenhower', 'Eisenhower')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={translate('codezera.pms.searchTickets', 'Search title or #number')}
              className="h-8 rounded-md border-border/50 bg-background pl-8 text-xs"
            />
          </div>
          <PmsPicker
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: ALL_STATUSES, label: translate('codezera.pms.allStatuses', 'All statuses') },
              ...pmsStatusPicks(queue?.statuses ?? [], options)
            ]}
            className="w-44 shrink-0 text-xs"
          />
        </div>
      </div>
      <div className="scrollbar-sleek @container min-h-0 flex-1 overflow-y-auto">
        {shown?.layout === 'eisenhower' ? (
          <div className="grid gap-4 p-4 @3xl:grid-cols-2">
            {shown.buckets.map((bucket) => (
              <Quadrant
                key={bucket.key}
                queue={shown}
                bucket={bucket}
                baseUrl={baseUrl}
                onOpen={onOpen}
                page={quadrantPages[bucket.key as PmsQuadrant] ?? 1}
                onPage={(next) =>
                  setQuadrantPages((current) => ({ ...current, [bucket.key]: next }))
                }
              />
            ))}
          </div>
        ) : shown ? (
          <>
            <ListHeader />
            {shown.layout === 'project' ? (
              shown.buckets.map((bucket) => (
                <ProjectGroup key={bucket.key} bucket={bucket} baseUrl={baseUrl} onOpen={onOpen} />
              ))
            ) : (
              <div className="divide-y divide-border/50">
                {shown.buckets.flatMap((bucket) =>
                  bucket.rows.map((row) => (
                    <ListRow
                      key={row.id}
                      row={row}
                      baseUrl={baseUrl}
                      onOpen={() => onOpen(toItem(row, baseUrl))}
                    />
                  ))
                )}
              </div>
            )}
          </>
        ) : null}
        {error ? <p className="px-4 py-3 text-xs break-words text-destructive">{error}</p> : null}
        {!loading && !error && shown && shown.layout !== 'eisenhower' && shown.total === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {translate('codezera.pms.empty', 'Nothing here.')}
          </p>
        ) : null}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
      {shown && shown.layout !== 'eisenhower' && shown.pageCount > 1 ? (
        <div className="flex h-9 items-center justify-end border-t border-border/50 px-4 text-muted-foreground">
          <Pager page={shown.page} pageCount={shown.pageCount} onPage={setPage} />
        </div>
      ) : null}
    </div>
  )
}
