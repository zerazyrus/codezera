import { useSyncExternalStore } from 'react'
import type { TOptions } from 'i18next'
import { i18n, loadRendererUiLanguage } from '@/i18n/i18n'

/** CloudGO PMS is a Vietnamese system, so its surfaces read Vietnamese whatever the app language is. */
const PMS_LOCALE = 'vi'

let catalogReady = false
let catalogRequest: Promise<void> | null = null
const listeners = new Set<() => void>()

function ensurePmsCatalog(): void {
  if (catalogReady || catalogRequest) {
    return
  }
  catalogRequest = loadRendererUiLanguage(PMS_LOCALE)
    .then(() => {
      catalogReady = true
      for (const listener of listeners) {
        listener()
      }
    })
    .catch((error: unknown) => {
      // English fallbacks stay on screen; the next PMS surface mount retries.
      catalogRequest = null
      console.warn('[codezera] PMS Vietnamese catalog unavailable', error)
    })
}

/** Re-renders the caller once the Vietnamese catalog is loaded; mount it at each PMS surface root. */
export function usePmsCatalog(): boolean {
  ensurePmsCatalog()
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => catalogReady
  )
}

/** Orca's `translate` pinned to Vietnamese (same name so the catalog scanner extracts these keys); English shows until the catalog loads. */
export function translate(key: string, fallback: string, options?: TOptions): string {
  return i18n.t(key, { defaultValue: fallback, ...options, lng: PMS_LOCALE })
}
