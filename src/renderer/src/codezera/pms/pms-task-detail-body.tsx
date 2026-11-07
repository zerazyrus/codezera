import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from './pms-i18n'
import { PmsPicker, pmsStatusPicks } from './pms-picker'
import type {
  PmsDetailSectionKey,
  PmsItemDetail,
  PmsStatusOption
} from '../../../../shared/codezera/pms-types'
import { PmsStatusBadge } from './pms-status-label'
import { pmsErrorText } from './pms-store'

function sectionTitle(key: PmsDetailSectionKey): string {
  switch (key) {
    case 'description':
      return translate('codezera.pms.section.description', 'Description')
    case 'steps':
      return translate('codezera.pms.section.steps', 'Steps to reproduce')
    case 'expected':
      return translate('codezera.pms.section.expected', 'Expected result')
    case 'actual':
      return translate('codezera.pms.section.actual', 'Actual result')
    case 'solution':
      return translate('codezera.pms.section.solution', 'Solution')
  }
}

/** ProjectTask detail: status moves save at once, the rest is read-only. */
export function PmsTaskDetailBody({
  detail,
  options,
  onChanged
}: {
  detail: PmsItemDetail
  options: PmsStatusOption[] | undefined
  onChanged: (next: PmsItemDetail) => void
}): React.JSX.Element {
  const [saving, setSaving] = useState(false)
  const changeStatus = (status: string): void => {
    setSaving(true)
    window.api.codezera.pms
      .setStatus({ kind: 'task', id: detail.id, status })
      .then(onChanged)
      .catch((err: unknown) =>
        toast.error(translate('codezera.pms.statusFailed', 'Status not changed'), {
          description: pmsErrorText(err)
        })
      )
      .finally(() => setSaving(false))
  }
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-[13px]">
      <div className="flex items-center gap-2">
        {detail.nextStatuses.length > 0 ? (
          <PmsPicker
            value={detail.status}
            onChange={changeStatus}
            disabled={saving}
            ariaLabel={translate('codezera.pms.changeStatus', 'Change status')}
            className="w-auto min-w-40"
            options={pmsStatusPicks(
              [detail.status, ...detail.nextStatuses.map((option) => option.value)],
              [...(options ?? []), ...detail.nextStatuses]
            ).map((pick, index) => (index === 0 ? { ...pick, disabled: true } : pick))}
          />
        ) : (
          <PmsStatusBadge status={detail.status} options={options} />
        )}
        {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5">
        {detail.category ? (
          <>
            <dt className="text-muted-foreground">
              {translate('codezera.pms.field.category', 'Type')}
            </dt>
            <dd className="text-foreground">{detail.category}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">
          {translate('codezera.pms.field.priority', 'Priority')}
        </dt>
        <dd className="text-foreground">{detail.priority || '—'}</dd>
      </dl>
      {detail.sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-1.5">
          <h4 className="text-xs text-muted-foreground">{sectionTitle(section.key)}</h4>
          <p className="leading-relaxed break-words whitespace-pre-wrap text-foreground select-text">
            {section.text}
          </p>
        </section>
      ))}
    </div>
  )
}
