import React, { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { CloudGoIcon } from './CloudGoIcon'
import { useAppStore } from '@/store'
import { translate, usePmsCatalog } from './pms-i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TaskPageSourceBar } from '@/components/task-page/SourceBar'
import type { TaskPageComposerActionsModel } from '@/components/task-page/use-task-page-composer-actions'
import type { TaskProvider } from '../../../../shared/work-items/task-providers'
import type { PmsItem } from '../../../../shared/codezera/pms-types'
import { PmsItemDrawer } from './pms-item-drawer'
import { PmsItemList } from './pms-item-list'
import { pmsAvailable, pmsFormatHours, usePmsStore } from './pms-store'
import { PMS_INTEGRATION_SECTION_ID } from './PmsIntegrationCard'

/** PMS chip after Orca's GitHub/GitLab/Linear/Jira chips in the Tasks source bar. */
export function PmsTaskSourceButton(): React.JSX.Element | null {
  usePmsCatalog()
  const active = usePmsStore((s) => s.taskPageActive)
  const setTaskPageActive = usePmsStore((s) => s.setTaskPageActive)
  if (!pmsAvailable()) {
    return null
  }
  const label = translate('codezera.pms.title', 'CloudGO PMS')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setTaskPageActive(true)}
          data-task-source="pms"
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'group flex h-8 w-8 items-center justify-center rounded-md border transition',
            active
              ? 'border-foreground/40 bg-muted/70 text-foreground shadow-sm'
              : 'border-border/40 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <CloudGoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function NotConnected(): React.JSX.Element {
  const status = usePmsStore((s) => s.status)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
      <CloudGoIcon className="size-8 opacity-50" />
      <p className="text-sm">
        {status?.state === 'error'
          ? translate('codezera.pms.connectionError', 'Cannot reach PMS')
          : translate('codezera.pms.notConnected', 'PMS is not connected')}
      </p>
      {status?.state === 'error' ? <p className="text-xs break-words">{status.message}</p> : null}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const state = useAppStore.getState()
          state.openSettingsTarget({
            pane: 'integrations',
            repoId: null,
            sectionId: PMS_INTEGRATION_SECTION_ID
          })
          state.openSettingsPage()
        }}
      >
        {translate('codezera.pms.openSettings', 'Connect in Settings')}
      </Button>
    </div>
  )
}

function PmsTaskContent(): React.JSX.Element {
  const todayHours = usePmsStore((s) => s.todayHours)
  const refreshTodayHours = usePmsStore((s) => s.refreshTodayHours)
  const [openItem, setOpenItem] = useState<PmsItem | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const openRequest = usePmsStore((s) => s.openRequest)
  const setOpenRequest = usePmsStore((s) => s.setOpenRequest)

  useEffect(() => {
    void refreshTodayHours().catch(() => undefined)
  }, [refreshTodayHours])

  // PmsItemList (a child, so its effect runs first) takes the tab; the drawer is taken here.
  useEffect(() => {
    if (openRequest) {
      if (openRequest.item) {
        setOpenItem(openRequest.item)
      }
      setOpenRequest(null)
    }
  }, [openRequest, setOpenRequest])

  const reload = (): void => {
    setReloadKey((key) => key + 1)
    void refreshTodayHours().catch(() => undefined)
  }

  return (
    <div className="mt-3 flex min-h-0 flex-1 overflow-hidden rounded-md border border-border/50 bg-muted/30 shadow-sm">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PmsItemList
          onOpen={setOpenItem}
          reloadKey={reloadKey}
          trailing={
            <>
              {todayHours !== null ? (
                <span
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-xs tabular-nums',
                    todayHours >= 7.5
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-border/60 text-foreground'
                  )}
                  title={translate('codezera.pms.todayHint', 'Hours logged today')}
                >
                  {translate('codezera.pms.today', 'Today {{hours}} / 7h30', {
                    hours: pmsFormatHours(todayHours)
                  })}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={translate('codezera.pms.refresh', 'Refresh')}
                onClick={reload}
              >
                <RefreshCw className="size-4" />
              </Button>
            </>
          }
        />
      </div>
      <PmsItemDrawer item={openItem} onClose={() => setOpenItem(null)} onChanged={reload} />
    </div>
  )
}

/**
 * Replaces the Tasks page body while PMS is the selected source. Orca's source bar is reused with a
 * taskSource no Orca chip matches, and picking an Orca chip hands the page back.
 */
export function useCodezeraTaskPage(model: TaskPageComposerActionsModel): React.JSX.Element | null {
  usePmsCatalog()
  const active = usePmsStore((s) => s.taskPageActive) && pmsAvailable()
  const setTaskPageActive = usePmsStore((s) => s.setTaskPageActive)
  const status = usePmsStore((s) => s.status)
  const loadStatus = usePmsStore((s) => s.loadStatus)

  useEffect(() => {
    if (active && !status) {
      void loadStatus()
    }
  }, [active, status, loadStatus])

  const pmsModel = useMemo<TaskPageComposerActionsModel>(
    () => ({
      ...model,
      // Not an Orca provider: keeps every Orca chip and provider control inactive.
      taskSource: 'pms' as TaskProvider,
      taskSourceContextSummary:
        status?.state === 'connected'
          ? {
              label: `${status.userName} · ${status.baseUrl.replace(/^https?:\/\//, '')}`,
              title: status.baseUrl
            }
          : { label: translate('codezera.pms.title', 'CloudGO PMS'), title: '' },
      openTaskPage: (data, options) => {
        setTaskPageActive(false)
        model.openTaskPage(data, options)
      }
    }),
    [model, status, setTaskPageActive]
  )

  if (!active) {
    return null
  }
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 min-w-0 w-full flex-1 flex-col px-5 pt-1.5 pb-4 md:px-8 md:pt-1.5 md:pb-5">
        <TaskPageSourceBar model={pmsModel} />
        {!status ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : status.state === 'connected' ? (
          <PmsTaskContent />
        ) : (
          <NotConnected />
        )}
      </div>
    </div>
  )
}
