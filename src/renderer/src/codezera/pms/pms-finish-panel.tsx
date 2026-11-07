import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PmsPicker, pmsStatusPicks } from './pms-picker'
import type { PmsFormField, PmsItemDetail } from '../../../../shared/codezera/pms-types'
import { PmsFieldForm, pmsFieldsFilled } from './pms-field-form'
import { pmsErrorText } from './pms-store'

/** Where a ticket goes when its processing is done (Kiểm thử / Kết thúc phases of the PMS workflow). */
const FINISH_STATUSES = [
  'Testing',
  'Pending Golive',
  'Wait Close',
  'Closed',
  'Wait For Response',
  'Cancel',
  'Reject'
]

/** `/pms ticket finish`: cause + solution + commit on the ticket, the next status, linked task closed. */
export function PmsFinishPanel({
  detail,
  onFinished,
  onClose
}: {
  detail: PmsItemDetail
  onFinished: (next: PmsItemDetail) => void
  onClose: () => void
}): React.JSX.Element {
  const choices = detail.nextStatuses.filter((option) => FINISH_STATUSES.includes(option.value))
  const [status, setStatus] = useState(
    () => choices.find((option) => option.value === 'Testing')?.value ?? choices[0]?.value ?? ''
  )
  const [cause, setCause] = useState('')
  const [solution, setSolution] = useState('')
  const [gitCommit, setGitCommit] = useState('')
  const [fields, setFields] = useState<PmsFormField[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = !busy && status !== '' && pmsFieldsFilled(fields, values)

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.codezera.pms.finishTicket({
        ticketId: detail.id,
        status,
        cause,
        solution,
        gitCommit,
        fields: values
      })
      if (result.needs === 'fields') {
        setFields(result.fields)
        return
      }
      onFinished(result.detail)
      toast.success(
        translate('codezera.pms.finished', '{{item}} moved to {{status}}', {
          item: detail.number,
          status
        })
      )
      onClose()
    } catch (err) {
      setError(pmsErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-[13px]"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {choices.length === 0 ? (
        <p className="text-muted-foreground">
          {translate(
            'codezera.pms.noFinishStatus',
            'PMS allows no finishing move from this status.'
          )}
        </p>
      ) : (
        <PmsPicker
          value={status}
          onChange={setStatus}
          options={pmsStatusPicks(
            choices.map((option) => option.value),
            choices
          )}
          className="w-full"
        />
      )}
      <Textarea
        value={cause}
        onChange={(event) => setCause(event.target.value)}
        placeholder={translate('codezera.pms.cause', 'Root cause, in the user’s words')}
        className="min-h-20 text-[13px]"
      />
      <Textarea
        value={solution}
        onChange={(event) => setSolution(event.target.value)}
        placeholder={translate('codezera.pms.solution', 'Solution, in the user’s words')}
        className="min-h-20 text-[13px]"
      />
      <Input
        value={gitCommit}
        onChange={(event) => setGitCommit(event.target.value)}
        placeholder={translate('codezera.pms.gitCommit', 'Git commit / MR link')}
        className="h-8 font-mono text-[13px]"
      />
      {fields.length > 0 ? (
        <PmsFieldForm fields={fields} values={values} onChange={setValues} ticketUrl={detail.url} />
      ) : null}
      {error ? <p className="break-words text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {translate('codezera.pms.cancel', 'Cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={!ready}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {translate('codezera.pms.finish', 'Finish')}
        </Button>
      </div>
    </form>
  )
}
