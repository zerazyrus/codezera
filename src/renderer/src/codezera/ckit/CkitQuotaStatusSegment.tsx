import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { WindowLabel } from '@/components/status-bar/StatusBarProviderSegment'
import { normalizeUsagePercentageDisplay } from '../../../../shared/usage-percentage-display'
import { useCkitQuotaPolling, useCkitQuotaStore } from './ckit-quota-store'
import {
  CKIT_USAGE_TEXT_CLASS,
  CkitDayBar,
  CloudgoLogo,
  ckitResetLabel,
  ckitUsageLevel,
  ckitWindowLabel
} from './ckit-quota-presentation'

/** Ckit gateway quota chip, styled like the Claude/Codex usage chips. Hidden until ckit is set up. */
export function CkitQuotaStatusSegment({
  compact
}: {
  compact: boolean
}): React.JSX.Element | null {
  useCkitQuotaPolling()
  const status = useCkitQuotaStore((s) => s.status)
  const display = normalizeUsagePercentageDisplay(useAppStore((s) => s.usagePercentageDisplay))
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)

  if (!status || status.state === 'not-configured') {
    return null
  }

  const windows = status.state === 'ok' ? status.windows : []
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent/70"
          aria-label={translate('codezera.ckit.statusLabel', 'Ckit quota')}
          onClick={() => {
            openSettingsTarget({ pane: 'accounts', repoId: null, sectionId: 'accounts-ckit' })
            openSettingsPage()
          }}
        >
          <CloudgoLogo size={14} />
          {status.state === 'error' ? (
            <AlertTriangle size={11} className="text-muted-foreground/80" />
          ) : windows.length === 0 ? (
            <span className="text-muted-foreground">
              {translate('codezera.ckit.unlimited', 'Unlimited')}
            </span>
          ) : (
            <>
              {windows.map((w, index) => (
                <React.Fragment key={w.kind}>
                  {index > 0 ? <span className="text-muted-foreground">·</span> : null}
                  {w.kind === 'day' ? <CkitDayBar w={w} display={display} /> : null}
                  {/* The rolling window has no bar; its number turns amber/red as it nears the block. */}
                  <span
                    className={
                      w.kind === 'day' ? undefined : CKIT_USAGE_TEXT_CLASS[ckitUsageLevel(w)]
                    }
                  >
                    <WindowLabel
                      w={{
                        usedPercent: w.usedPercent,
                        windowMinutes: (w.windowSeconds ?? 86_400) / 60,
                        resetsAt: w.resetsAt,
                        resetDescription: null
                      }}
                      label={ckitWindowLabel(w).toLowerCase()}
                      display={display}
                      showLabel={!compact}
                    />
                  </span>
                </React.Fragment>
              ))}
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="space-y-1">
        <div className="font-medium">
          {translate('codezera.ckit.tooltipTitle', 'Ckit · CloudGO AI Gateway')}
        </div>
        {status.state === 'error' ? (
          <div>{status.message}</div>
        ) : windows.length === 0 ? (
          <div>{translate('codezera.ckit.unlimitedHint', 'This key has no quota limit.')}</div>
        ) : (
          <>
            {windows.map((w) => (
              <div key={w.kind} className="tabular-nums">
                {ckitWindowLabel(w)} {Math.round(w.usedPercent)}%
                {ckitResetLabel(w) ? ` · ${ckitResetLabel(w)}` : ''}
              </div>
            ))}
            <div className="max-w-[260px] text-muted-foreground">
              {translate(
                'codezera.ckit.limitsHint',
                'Each limit blocks requests at 100%. The rolling window drains back to 0% when idle; the day budget only grows until it resets.'
              )}
            </div>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
