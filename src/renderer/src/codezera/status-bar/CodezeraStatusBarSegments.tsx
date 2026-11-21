import React from 'react'
import { RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { isPairedWebClientWindow } from '@/app-shell/chrome/desktop-window-chrome'
import { CkitQuotaStatusSegment } from '../ckit/CkitQuotaStatusSegment'
import { useCkitQuotaStore } from '../ckit/ckit-quota-store'
import { CodezeraBranchStatusSegment } from '../branch-status/CodezeraBranchStatusSegment'
import { PmsStatusSegment } from '../pms/pms-status-segment'

/** A set-up Ckit counts as usage tracking, so Orca's "set up usage" prompt stays hidden. */
export function useCkitTracksUsage(): boolean {
  const state = useCkitQuotaStore((s) => s.status?.state)
  return !isPairedWebClientWindow() && state !== undefined && state !== 'not-configured'
}

/** Branch, PMS and Ckit quota segments, shown ahead of Orca's usage area. */
export function CodezeraStatusBarSegments(): React.JSX.Element {
  const t = useTranslate()
  const ckitActive = useCkitTracksUsage()
  const refreshing = useCkitQuotaStore((s) => s.refreshing)
  const refresh = useCkitQuotaStore((s) => s.refresh)
  const desktop = !isPairedWebClientWindow()

  return (
    <div className="flex shrink-0 items-center gap-3">
      {desktop ? <CodezeraBranchStatusSegment compact={false} /> : null}
      <PmsStatusSegment compact={false} />
      {desktop ? <CkitQuotaStatusSegment compact={false} /> : null}
      {ckitActive ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              aria-label={t(
                'auto.components.status.bar.StatusBar.3325d996cb',
                'Refresh rate limits'
              )}
            >
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {t('auto.components.status.bar.StatusBar.c8857b40f7', 'Refresh usage data')}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
