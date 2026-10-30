import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { CkitQuotaWindow } from '../../../../shared/codezera/ckit-types'
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
