import React, { useEffect, useState } from 'react'
import { ArrowRight, CheckCheck, Clock, Copy, ExternalLink, Loader2, X } from 'lucide-react'
import * as VisuallyHidden from 'radix-ui/visually-hidden'
import { toast } from 'sonner'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  PMS_TICKET_EDIT_FIELDS,
  type PmsFormField,
  type PmsItem,
  type PmsItemDetail,
  type PmsTicketSaveResult
} from '../../../../shared/codezera/pms-types'
import { PmsFieldForm, pmsFieldsFilled } from './pms-field-form'
import { PmsFinishPanel } from './pms-finish-panel'
import { PmsLogTimeForm } from './pms-log-time-form'
import { PmsStatusRail } from './pms-status-rail'
import { pmsErrorText, usePmsStore } from './pms-store'
import { PmsTakePanel } from './pms-take-panel'
import { PmsTaskDetailBody } from './pms-task-detail-body'
import { PmsTicketQuickEdit, type PmsTicketDraft } from './pms-ticket-quick-edit'
import { pmsAgentPrompt } from './pms-workspace-link'

type Panel = 'none' | 'take' | 'finish' | 'log'

function IconAction({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function DrawerBody({
  item,
  onClose,
  onChanged
}: {
  item: PmsItem
  onClose: () => void
  onChanged: () => void
}): React.JSX.Element {
  const [detail, setDetail] = useState<PmsItemDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('none')
  const [draft, setDraft] = useState<PmsTicketDraft | null>(null)
  const [draftStatus, setDraftStatus] = useState(item.status)
  const [saving, setSaving] = useState(false)
  // Fields PMS requires before it accepts the pending save.
  const [missing, setMissing] = useState<PmsFormField[] | null>(null)
  const [missingValues, setMissingValues] = useState<Record<string, string>>({})
  const statusOptions = usePmsStore((s) => s.statusOptions[item.kind])
  const loadStatusOptions = usePmsStore((s) => s.loadStatusOptions)

  const show = (next: PmsItemDetail): void => {
    setDetail(next)
    setDraft(next.ticket ? { ...next.ticket.values } : null)
    setDraftStatus(next.status)
    setMissing(null)
    setMissingValues({})
  }
  const changed = (next: PmsItemDetail): void => {
    show(next)
    onChanged()
  }
  const toggle = (next: Panel): void => setPanel((current) => (current === next ? 'none' : next))

  useEffect(() => {
    let cancelled = false
    void loadStatusOptions(item.kind).catch(() => undefined)
    window.api.codezera.pms
      .getItem({ kind: item.kind, id: item.id })
      .then((next) => !cancelled && show(next))
      .catch((err: unknown) => !cancelled && setError(pmsErrorText(err)))
    return () => {
      cancelled = true
    }
  }, [item.kind, item.id, loadStatusOptions])

  const changedFields =
    detail?.ticket && draft
      ? Object.fromEntries(
          PMS_TICKET_EDIT_FIELDS.filter(
            (field) => draft[field] !== detail.ticket?.values[field]
          ).map((field) => [field, draft[field]])
        )
      : {}
  const statusChanged = detail !== null && draftStatus !== detail.status
  const dirty = statusChanged || Object.keys(changedFields).length > 0

  const finishSave = (save: Promise<PmsTicketSaveResult>): void => {
    setSaving(true)
    save
      .then((result) => {
        if (result.needs === 'fields') {
          setMissing(result.fields)
          return
        }
        changed(result.detail)
        toast.success(translate('codezera.pms.saved', 'Saved to PMS'))
      })
      .catch((err: unknown) =>
        toast.error(translate('codezera.pms.saveFailed', 'Not saved'), {
          description: pmsErrorText(err)
        })
      )
      .finally(() => setSaving(false))
  }

  const saveTicket = (): void => {
    finishSave(
      window.api.codezera.pms.saveTicket({
        ticketId: item.id,
        status: statusChanged ? draftStatus : null,
        fields: { ...changedFields, ...missingValues }
      })
    )
  }

  const shown = detail ?? item
  const categoryLabel =
    detail?.ticket?.options.ticketcategories?.find((option) => option.value === detail.category)
      ?.label ?? detail?.category

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex-none border-b border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-mono">{shown.number}</span>
              {shown.projectLabel ? <span>{shown.projectLabel}</span> : null}
              {categoryLabel ? <span>{categoryLabel}</span> : null}
              {detail?.createdTime ? <span>{detail.createdTime.slice(0, 10)}</span> : null}
              <span className="tabular-nums">
                {translate('codezera.pms.hoursLoggedValue', 'Logged {{hours}}h', {
                  hours: shown.hours
                })}
              </span>
              {!detail && !error ? <Loader2 className="size-3 animate-spin" /> : null}
            </div>
            <h2 className="mt-1 text-[20px] leading-tight font-semibold text-foreground select-text">
              {shown.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant={panel === 'log' ? 'secondary' : 'outline'}
              size="sm"
              disabled={!detail}
              onClick={() => toggle('log')}
            >
              <Clock className="size-4" />
              {translate('codezera.pms.logTime', 'Log time')}
            </Button>
            {item.kind === 'ticket' ? (
              <Button
                variant={panel === 'finish' ? 'secondary' : 'outline'}
                size="sm"
                disabled={!detail}
                onClick={() => toggle('finish')}
              >
                <CheckCheck className="size-4" />
                {translate('codezera.pms.finish', 'Finish')}
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={!detail}
              title={translate('codezera.pms.startWork', 'Start: take it and open an agent')}
              onClick={() => toggle('take')}
            >
              {translate('codezera.pms.start', 'Start')}
              <ArrowRight className="size-4" />
            </Button>
            <IconAction
              label={translate('codezera.pms.copyPrompt', 'Copy agent prompt')}
              disabled={!detail}
              onClick={() => {
                if (detail) {
                  void window.api.ui
                    .writeClipboardText(pmsAgentPrompt(detail))
                    .then(() =>
                      toast.success(translate('codezera.pms.promptCopied', 'Agent prompt copied'))
                    )
                }
              }}
            >
              <Copy className="size-4" />
            </IconAction>
            <IconAction
              label={translate('codezera.pms.openInPms', 'Open in PMS')}
              onClick={() => void window.api.shell.openUrl(shown.url)}
            >
              <ExternalLink className="size-4" />
            </IconAction>
            <IconAction label={translate('codezera.pms.close', 'Close')} onClick={onClose}>
              <X className="size-4" />
            </IconAction>
          </div>
        </div>
        {detail && panel !== 'none' ? (
          <div className="mt-3 text-[13px]">
            {panel === 'take' ? (
              <PmsTakePanel detail={detail} onTaken={changed} onClose={() => setPanel('none')} />
            ) : panel === 'finish' ? (
              <PmsFinishPanel
                detail={detail}
                onFinished={changed}
                onClose={() => setPanel('none')}
              />
            ) : (
              <PmsLogTimeForm
                item={detail}
                onDone={() => {
                  setPanel('none')
                  onChanged()
                }}
              />
            )}
          </div>
        ) : null}
      </div>

      {error ? <p className="px-4 py-3 text-sm break-words text-destructive">{error}</p> : null}

      {detail?.ticket && draft ? (
        <div className="flex min-h-0 flex-1">
          <PmsStatusRail
            current={detail.status}
            selected={draftStatus}
            allowed={detail.nextStatuses}
            options={statusOptions ?? []}
            steps={detail.ticket.steps}
            disabled={saving}
            onSelect={setDraftStatus}
          />
          <div className="scrollbar-sleek @container min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4">
            <PmsTicketQuickEdit
              detail={detail}
              ticket={detail.ticket}
              draft={draft}
              disabled={saving}
              onChange={(field, value) => setDraft({ ...draft, [field]: value })}
            />
          </div>
        </div>
      ) : detail ? (
        <PmsTaskDetailBody detail={detail} options={statusOptions} onChanged={changed} />
      ) : null}

      {detail?.ticket && (dirty || missing) ? (
        <div className="flex-none border-t border-border/50 bg-muted/30 px-4 py-3 text-[13px]">
          {missing ? (
            <div className="mb-3 flex flex-col gap-2">
              <p className="text-muted-foreground">
                {translate('codezera.pms.needsFields', 'PMS needs these fields before saving:')}
              </p>
              <PmsFieldForm
                fields={missing}
                values={missingValues}
                onChange={setMissingValues}
                ticketUrl={detail.url}
              />
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => show(detail)}>
              {translate('codezera.pms.cancel', 'Cancel')}
            </Button>
            <Button
              size="sm"
              disabled={saving || (missing !== null && !pmsFieldsFilled(missing, missingValues))}
              onClick={saveTicket}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {translate('codezera.pms.save', 'Save')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** One PMS ticket or task in a side sheet over the list, like Orca's Jira and Linear previews. */
export function PmsItemDrawer({
  item,
  onClose,
  onChanged
}: {
  item: PmsItem | null
  onClose: () => void
  onChanged: () => void
}): React.JSX.Element {
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        data-codezera-overlay=""
        className="w-[min(94vw,1120px)] p-0 sm:max-w-[1120px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <VisuallyHidden.Root asChild>
          <SheetTitle>{item?.title ?? translate('codezera.pms.title', 'CloudGO PMS')}</SheetTitle>
        </VisuallyHidden.Root>
        <VisuallyHidden.Root asChild>
          <SheetDescription>
            {translate(
              'codezera.pms.drawerDescription',
              'Review, edit and start work on this item.'
            )}
          </SheetDescription>
        </VisuallyHidden.Root>
        {item ? (
          <DrawerBody
            key={`${item.kind}:${item.id}`}
            item={item}
            onClose={onClose}
            onChanged={onChanged}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
