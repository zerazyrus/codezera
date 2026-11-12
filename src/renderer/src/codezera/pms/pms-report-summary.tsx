import { useEffect } from 'react'
import type React from 'react'
import { translate } from './pms-i18n'
import { cn } from '@/lib/class-names'
import type { PmsReportPreview } from '../../../../shared/codezera/pms-types'
import { PmsStatusBadge } from './pms-status-label'
import { pmsFormatHours, usePmsStore } from './pms-store'

export const PMS_DAY_HOURS = 7.5

// PMS screens are pinned to Vietnamese (pms-i18n), so weekdays read "T2", not the app or OS language.
const WEEKDAY_FORMAT = new Intl.DateTimeFormat('vi', { weekday: 'short', day: '2-digit' })

/** Logged time behind a report: per day for a week, then each record by project. */
export function PmsReportSummary({ preview }: { preview: PmsReportPreview }): React.JSX.Element {
  const taskOptions = usePmsStore((s) => s.statusOptions.task)
  const ticketOptions = usePmsStore((s) => s.statusOptions.ticket)
  const loadStatusOptions = usePmsStore((s) => s.loadStatusOptions)
  useEffect(() => {
    void loadStatusOptions('task').catch(() => undefined)
    void loadStatusOptions('ticket').catch(() => undefined)
  }, [loadStatusOptions])
  const groups = new Map<string, PmsReportPreview['entries']>()
  for (const entry of preview.entries) {
    const tag = /^\s*\[([^\]]+)\]/.exec(entry.name)?.[1] ?? entry.projectLabel
    groups.set(tag, [...(groups.get(tag) ?? []), entry])
  }
  return (
    <div className="flex flex-col gap-4">
      {preview.type === 'week' ? (
        <div className="grid grid-cols-7 gap-1.5">
          {Object.entries(preview.perDay).map(([day, hours]) => (
            <div
              key={day}
              className="flex flex-col items-center gap-1 rounded-md border border-border/50 bg-background/50 px-1 py-2"
            >
              <span className="text-2xs text-muted-foreground">
                {WEEKDAY_FORMAT.format(new Date(`${day}T00:00:00`))}
              </span>
              <span
                className={cn(
                  'text-[13px] font-medium tabular-nums',
                  hours === 0
                    ? 'text-muted-foreground/60'
                    : hours < PMS_DAY_HOURS
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-foreground'
                )}
              >
                {pmsFormatHours(hours)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {[...groups].map(([project, entries]) => (
        <section key={project || '-'} className="flex flex-col gap-1">
          <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              {project || translate('codezera.pms.report.noProject', 'No project')}
            </span>
            <span className="tabular-nums">
              {pmsFormatHours(entries.reduce((sum, entry) => sum + entry.hours, 0))}
            </span>
          </h4>
          {entries.map((entry) => (
            <div
              key={`${entry.module}:${entry.recordId}`}
              className="flex items-start gap-3 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent/50"
            >
              <span className="w-11 shrink-0 text-right font-medium tabular-nums text-muted-foreground">
                {pmsFormatHours(entry.hours)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 leading-snug text-foreground">{entry.name}</span>
                {entry.notes.length > 0 ? (
                  <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {entry.notes.join(' · ')}
                  </span>
                ) : null}
              </span>
              {entry.status ? (
                <PmsStatusBadge
                  status={entry.status}
                  options={entry.module === 'HelpDesk' ? ticketOptions : taskOptions}
                  className="shrink-0"
                />
              ) : null}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
