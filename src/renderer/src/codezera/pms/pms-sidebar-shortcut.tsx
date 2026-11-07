import React, { useEffect } from 'react'
import { translate, usePmsCatalog } from './pms-i18n'
import { useAppStore } from '@/store'
import { CloudGoIcon } from './CloudGoIcon'
import { pmsAvailable, usePmsStore, type PmsOpenRequest } from './pms-store'

/** Opens the Tasks page on PMS, optionally on a tab or with an item's drawer open. */
export function openPmsPage(request: PmsOpenRequest | null = null): void {
  useAppStore.getState().openTaskPage()
  const pms = usePmsStore.getState()
  pms.setTaskPageActive(true)
  pms.setOpenRequest(request)
}

/**
 * PMS icon among the sidebar Tasks shortcuts. Orca's own shortcuts open the page with a
 * `taskSource`, which hands the page back from PMS.
 */
export function PmsSidebarShortcut({
  Shortcut
}: {
  Shortcut: React.ComponentType<{ label: string; onOpen: () => void; children: React.ReactNode }>
}): React.JSX.Element | null {
  usePmsCatalog()
  const setTaskPageActive = usePmsStore((s) => s.setTaskPageActive)

  useEffect(
    () =>
      useAppStore.subscribe((state, prev) => {
        if (state.taskPageData !== prev.taskPageData && state.taskPageData.taskSource) {
          setTaskPageActive(false)
        }
      }),
    [setTaskPageActive]
  )

  if (!pmsAvailable()) {
    return null
  }
  return (
    <Shortcut
      label={translate('codezera.pms.openPmsTasks', 'Open CloudGO PMS tasks')}
      onOpen={() => openPmsPage()}
    >
      <CloudGoIcon className="size-3.5" />
    </Shortcut>
  )
}
