import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PmsPicker } from './pms-picker'
import { localizeTextGenerationResult } from '@/lib/text-generation/text-generation-error-copy'
import type { PmsReportPreview, PmsReportType } from '../../../../shared/codezera/pms-types'
import { PMS_DAY_HOURS, PmsReportSummary } from './pms-report-summary'
import { pmsErrorText, pmsFormatHours, pmsToday, usePmsStore } from './pms-store'

const RECIPIENTS_KEY = 'codezera.pms.reportRecipients'

function shiftDate(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + days)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
}

/** `/pms bc` and `/pms bc tuần`: the period's logged time, a description to edit, then file it. */
export function PmsReportView(): React.JSX.Element {
  const users = usePmsStore((s) => s.users)
  const loadUsers = usePmsStore((s) => s.loadUsers)
  const myId = usePmsStore((s) => (s.status?.state === 'connected' ? s.status.userId : ''))
  const [type, setType] = useState<PmsReportType>('day')
  const [date, setDate] = useState(pmsToday)
  const [preview, setPreview] = useState<PmsReportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [writing, setWriting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [recipients, setRecipients] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECIPIENTS_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const latest = useRef(0)

  useEffect(() => {
    void loadUsers().catch(() => undefined)
  }, [loadUsers])

  const load = useCallback(async (): Promise<void> => {
    const request = ++latest.current
    setLoading(true)
    setError(null)
    try {
      const next = await window.api.codezera.pms.reportPreview({ type, date })
      if (request === latest.current) {
        setPreview(next)
        setName(next.name)
        setDescription(next.description)
      }
    } catch (err) {
      if (request === latest.current) {
        setError(pmsErrorText(err))
        setPreview(null)
      }
    } finally {
      if (request === latest.current) {
        setLoading(false)
      }
    }
  }, [type, date])

  useEffect(() => {
    void load()
  }, [load])

  const saveRecipients = (next: string[]): void => {
    localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(next))
    setRecipients(next)
  }

  const write = async (): Promise<void> => {
    setWriting(true)
    try {
      const result = localizeTextGenerationResult(
        await window.api.codezera.pms.writeReport({ type, date, notes })
      )
      if (result.success) {
        setDescription(result.description)
      } else if (!result.canceled) {
        toast.error(result.error)
      }
    } catch (err) {
      toast.error(pmsErrorText(err))
    } finally {
      setWriting(false)
    }
  }

  const submit = async (draft: boolean): Promise<void> => {
    setSubmitting(true)
    try {
      const result = await window.api.codezera.pms.submitReport({
        type,
        date,
        name,
        description,
        recipientIds: recipients,
        draft
      })
      toast.success(
        draft
          ? translate('codezera.pms.report.drafted', 'Report saved as draft')
          : translate('codezera.pms.report.submitted', 'Report submitted'),
        result.url
          ? {
              action: {
                label: translate('codezera.pms.openInPms', 'Open in PMS'),
                onClick: () => void window.api.shell.openUrl(result.url ?? '')
              }
            }
          : undefined
      )
      await load()
    } catch (err) {
      toast.error(pmsErrorText(err))
    } finally {
      setSubmitting(false)
    }
  }

  const short = !!preview && preview.type === 'day' && preview.totalHours < PMS_DAY_HOURS
  const extraRecipients = recipients.filter((id) => !preview?.managerIds.includes(id))
  const filed = (preview?.existing.length ?? 0) > 0
  const canSubmit =
    !!preview &&
    preview.entries.length > 0 &&
    !filed &&
    !!name.trim() &&
    !!description.trim() &&
    !loading &&
    !writing &&
    !submitting
  const period = preview
    ? preview.type === 'day'
      ? preview.start.split('-').toReversed().join('/')
      : translate('codezera.pms.report.weekLabel', 'Week {{week}} · {{start}} – {{end}}', {
          week: preview.week,
          start: preview.start.split('-').toReversed().slice(0, 2).join('/'),
          end: preview.end.split('-').toReversed().slice(0, 2).join('/')
        })
    : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={type}
          onValueChange={(next) => next && setType(next as PmsReportType)}
        >
          <ToggleGroupItem value="day" className="px-3 text-[13px]">
            {translate('codezera.pms.report.daily', 'Daily')}
          </ToggleGroupItem>
          <ToggleGroupItem value="week" className="px-3 text-[13px]">
            {translate('codezera.pms.report.weekly', 'Weekly')}
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('codezera.pms.report.previous', 'Previous period')}
          onClick={() => setDate(shiftDate(date, type === 'day' ? -1 : -7))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(event) => event.target.value && setDate(event.target.value)}
          className="h-8 w-36 text-[13px]"
          aria-label={translate('codezera.pms.date', 'Date')}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('codezera.pms.report.next', 'Next period')}
          onClick={() => setDate(shiftDate(date, type === 'day' ? 1 : 7))}
        >
          <ChevronRight className="size-4" />
        </Button>
        <span className="text-[13px] text-muted-foreground">{period}</span>
        {preview ? (
          <span
            className={
              short
                ? 'ml-auto text-[13px] font-medium text-amber-600 tabular-nums dark:text-amber-400'
                : 'ml-auto text-[13px] font-medium tabular-nums'
            }
          >
            {translate('codezera.pms.report.total', 'Logged {{hours}}', {
              hours: pmsFormatHours(preview.totalHours)
            })}
          </span>
        ) : null}
      </div>
      {loading && !preview ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="p-4 text-sm break-words text-destructive">{error}</p>
      ) : preview && preview.entries.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {translate('codezera.pms.report.empty', 'No time logged in this period.')}
        </p>
      ) : preview ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto scrollbar-sleek lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:overflow-hidden">
          <div className="min-h-0 overflow-y-auto scrollbar-sleek border-border/50 p-4 lg:border-r">
            <PmsReportSummary preview={preview} />
          </div>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto scrollbar-sleek p-4">
            {preview.existing.map((report) => (
              <div
                key={report.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[13px]"
              >
                <span className="min-w-0 flex-1">
                  {translate(
                    'codezera.pms.report.alreadyFiled',
                    'Already filed: {{number}} ({{status}})',
                    {
                      number: report.number,
                      status: report.status
                    }
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void window.api.shell.openUrl(report.url)}
                >
                  <ExternalLink className="size-3.5" />
                  {translate('codezera.pms.openInPms', 'Open in PMS')}
                </Button>
              </div>
            ))}
            {short ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
                {translate(
                  'codezera.pms.report.shortDay',
                  '{{missing}} short of 7h30. Log the missing time first, or submit anyway.',
                  { missing: pmsFormatHours(PMS_DAY_HOURS - preview.totalHours) }
                )}
              </p>
            ) : null}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {translate('codezera.pms.report.name', 'Title')}
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-8 text-[13px] text-foreground"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {translate('codezera.pms.report.description', 'Description')}
              </span>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={writing}
                className="min-h-64 font-mono text-[12.5px] leading-relaxed"
              />
              <div className="flex items-center gap-1.5">
                <Input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={translate(
                    'codezera.pms.report.aiNotes',
                    'Notes for AI (optional), e.g. next week: finish the Kova import'
                  )}
                  className="h-8 min-w-0 flex-1 text-[13px]"
                  disabled={writing}
                />
                {writing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void window.api.codezera.pms.cancelWriteReport()}
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                    {translate('codezera.pms.cancel', 'Cancel')}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => void write()}>
                    <Sparkles className="size-3.5" />
                    {translate('codezera.pms.report.writeWithAi', 'Rewrite with AI')}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                {translate('codezera.pms.report.recipients', 'Recipients (besides you)')}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {preview.managerIds.map((id) => (
                  <span
                    key={id}
                    title={translate(
                      'codezera.pms.report.managerHint',
                      'Your manager in PMS, always receives the report'
                    )}
                    className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[13px]"
                  >
                    {users?.find((user) => user.id === id)?.name ?? `#${id}`}
                    <span className="text-[11px] text-muted-foreground">
                      {translate('codezera.pms.report.manager', 'Manager')}
                    </span>
                  </span>
                ))}
                {extraRecipients.map((id) => (
                  <span
                    key={id}
                    className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 py-0.5 pr-1 pl-2.5 text-[13px]"
                  >
                    {users?.find((user) => user.id === id)?.name ?? `#${id}`}
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={translate('codezera.pms.report.removeRecipient', 'Remove')}
                      onClick={() => saveRecipients(recipients.filter((entry) => entry !== id))}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <PmsPicker
                  value=""
                  onChange={(id) => saveRecipients([...recipients, id])}
                  disabled={!users}
                  placeholder={translate('codezera.pms.report.addRecipient', 'Add recipient')}
                  className="h-7 w-44"
                  options={(users ?? [])
                    .filter(
                      (user) =>
                        user.id !== myId &&
                        !recipients.includes(user.id) &&
                        !preview.managerIds.includes(user.id)
                    )
                    .map((user) => ({ value: user.id, label: user.name }))}
                />
              </div>
            </div>
            <div className="mt-auto flex justify-end gap-1.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canSubmit}
                onClick={() => void submit(true)}
              >
                {translate('codezera.pms.report.saveDraft', 'Save draft')}
              </Button>
              <Button size="sm" disabled={!canSubmit} onClick={() => void submit(false)}>
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {short
                  ? translate('codezera.pms.report.submitShort', 'Submit anyway')
                  : translate('codezera.pms.report.submit', 'Submit report')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
