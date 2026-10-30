import { useEffect } from 'react'
import { create } from 'zustand'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { CkitQuotaStatus } from '../../../../shared/codezera/ckit-types'

// Matches omp's gw-quota extension cadence.
const POLL_MS = 180_000

type CkitQuotaStore = {
  status: CkitQuotaStatus | null
  refreshing: boolean
  refresh: () => Promise<void>
  /** Throws the gateway's reason so the form can show it. */
  saveApiKey: (apiKey: string) => Promise<void>
}

export const useCkitQuotaStore = create<CkitQuotaStore>()((set, get) => ({
  status: null,
  refreshing: false,
  refresh: async () => {
    // The quota key lives in this computer's omp config; paired web clients have no access to it.
    if (get().refreshing || isPairedWebClientWindow() || isWebClientLocation()) {
      return
    }
    set({ refreshing: true })
    try {
      set({ status: await window.api.codezera.ckit.getQuota() })
    } catch (error) {
      console.warn('Failed to read Ckit quota:', error)
    } finally {
      set({ refreshing: false })
    }
  },
  saveApiKey: async (apiKey) => {
    set({ status: await window.api.codezera.ckit.saveApiKey(apiKey) })
  }
}))

/** Mount once (status bar) so every Ckit surface shares one poll. */
export function useCkitQuotaPolling(): void {
  const refresh = useCkitQuotaStore((s) => s.refresh)
  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])
}
