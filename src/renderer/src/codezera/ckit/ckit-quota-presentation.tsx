import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { CkitQuotaWindow } from '../../../../shared/codezera/ckit-types'
import {
  getDisplayedUsagePercentage,
  type UsagePercentageDisplay
} from '../../../../shared/usage-percentage-display'
import cloudgoLogoUrl from './cloudgo-logo.png?url'

export function CloudgoLogo({ size, className }: { size: number; className?: string }) {
  return (
    <img
      src={cloudgoLogoUrl}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', className)}
      draggable={false}
    />
  )
}

type CkitUsageLevel = 'ok' | 'warn' | 'full'

/** Both limits block requests at 100%, so they share the warning thresholds. */
export function ckitUsageLevel(w: CkitQuotaWindow): CkitUsageLevel {
  return w.exceeded || w.usedPercent >= 90 ? 'full' : w.usedPercent >= 70 ? 'warn' : 'ok'
}

export const CKIT_USAGE_TEXT_CLASS: Record<CkitUsageLevel, string> = {
  ok: '',
  warn: 'text-status-warning-text',
  full: 'text-destructive'
}

const BAR_CLASS: Record<CkitUsageLevel, string> = {
  ok: 'bg-muted-foreground/60',
  warn: 'bg-status-warning',
  full: 'bg-destructive'
}

/** Day budget bar: it only grows during the day, so a filling bar shows how close the block is. */
export function CkitDayBar({
  w,
  display
}: {
  w: CkitQuotaWindow
  display: UsagePercentageDisplay
}): React.JSX.Element {
  const used = Math.min(100, Math.max(0, w.usedPercent))
  const tone = BAR_CLASS[ckitUsageLevel(w)]
  return (
    <span
      data-usage-bar
      className="inline-block w-[48px] h-[6px] rounded-full bg-muted overflow-hidden flex-shrink-0"
    >
      <span
        className={cn('block h-full rounded-full transition-all duration-300', tone)}
        style={{ width: `${getDisplayedUsagePercentage(used, display)}%` }}
      />
    </span>
  )
}

/** "4h" for the rolling bucket, "Day" for the calendar budget — same labels as omp's quota line. */
export function ckitWindowLabel(w: CkitQuotaWindow): string {
  if (w.kind === 'day') {
    return translate('codezera.ckit.day', 'Day')
  }
  const sec = w.windowSeconds ?? 0
  if (sec > 0 && sec % 3600 === 0) {
    return `${sec / 3600}h`
  }
  return sec > 0 ? `${Math.round(sec / 60)}m` : translate('codezera.ckit.window', 'Window')
}

export function ckitResetLabel(w: CkitQuotaWindow): string | null {
  if (w.resetsAt === null) {
    return null
  }
  const at = new Date(w.resetsAt)
  const sameDay = at.toDateString() === new Date().toDateString()
  const when = sameDay
    ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return translate('codezera.ckit.resets', 'Resets {{when}}', { when })
}
