import React, { useEffect, useId } from 'react'
import { ExternalLink } from 'lucide-react'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PmsPicker } from './pms-picker'
import type { PmsFormField } from '../../../../shared/codezera/pms-types'
import { usePmsStore } from './pms-store'

function UserInput({
  value,
  onChange
}: {
  value: string
  onChange: (id: string) => void
}): React.JSX.Element {
  const users = usePmsStore((s) => s.users)
  const loadUsers = usePmsStore((s) => s.loadUsers)
  const listId = useId()
  useEffect(() => {
    void loadUsers().catch(() => undefined)
  }, [loadUsers])
  const current = users?.find((user) => user.id === value)
  return (
    <>
      <Input
        list={listId}
        defaultValue={current?.name ?? ''}
        placeholder={translate('codezera.pms.pickUser', 'Type a name')}
        className="h-8 text-[13px]"
        onChange={(event) => {
          const match = users?.find((user) => user.name === event.target.value)
          onChange(match?.id ?? '')
        }}
      />
      <datalist id={listId}>
        {users?.map((user) => (
          <option key={user.id} value={user.name} />
        ))}
      </datalist>
    </>
  )
}

/**
 * Fields the PMS "Cập nhật tình trạng" modal would require before this move. Reference fields
 * (project, installation) only have a web picker, so they link to the ticket instead.
 */
export function PmsFieldForm({
  fields,
  values,
  onChange,
  ticketUrl
}: {
  fields: PmsFormField[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  ticketUrl: string
}): React.JSX.Element {
  const set = (field: string, value: string): void => onChange({ ...values, [field]: value })
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-2">
      <p className="text-muted-foreground">
        {translate('codezera.pms.missingFields', 'PMS requires these fields for this step:')}
      </p>
      {fields.map((field) => (
        <label key={field.field} className="flex flex-col gap-1">
          <span className="text-foreground">{field.label}</span>
          {field.kind === 'textarea' ? (
            <Textarea
              value={values[field.field] ?? ''}
              onChange={(event) => set(field.field, event.target.value)}
              className="min-h-20 text-[13px]"
            />
          ) : field.kind === 'date' ? (
            <Input
              type="date"
              value={values[field.field] ?? ''}
              onChange={(event) => set(field.field, event.target.value)}
              className="h-8 text-[13px]"
            />
          ) : field.kind === 'picklist' ? (
            <PmsPicker
              value={values[field.field] ?? ''}
              onChange={(value) => set(field.field, value)}
              options={field.options ?? []}
              className="w-full"
            />
          ) : field.kind === 'user' ? (
            <UserInput value={values[field.field] ?? ''} onChange={(id) => set(field.field, id)} />
          ) : field.kind === 'reference' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => void window.api.shell.openUrl(ticketUrl)}
            >
              <ExternalLink className="size-4" />
              {translate('codezera.pms.setOnWeb', 'Set it in PMS, then retry')}
            </Button>
          ) : (
            <Input
              value={values[field.field] ?? ''}
              onChange={(event) => set(field.field, event.target.value)}
              className="h-8 text-[13px]"
            />
          )}
        </label>
      ))}
    </div>
  )
}

/** Only fields the user can fill here count; reference fields are fixed on the web and retried. */
export function pmsFieldsFilled(fields: PmsFormField[], values: Record<string, string>): boolean {
  return fields.every((field) => field.kind === 'reference' || (values[field.field] ?? '').trim())
}
