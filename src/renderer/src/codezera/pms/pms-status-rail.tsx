import type React from 'react'
import { History } from 'lucide-react'
import { translate } from './pms-i18n'
import { cn } from '@/lib/class-names'
import {
  PMS_TICKET_STATUS_PHASES,
  type PmsStatusOption,
  type PmsStatusStep,
  type PmsTicketPhase
} from '../../../../shared/codezera/pms-types'

function phaseLabel(phase: PmsTicketPhase): string {
  switch (phase) {
    case 'reception':
      return translate('codezera.pms.phase.reception', 'Intake')
    case 'processing':
      return translate('codezera.pms.phase.processing', 'Processing')
    case 'testing':
      return translate('codezera.pms.phase.testing', 'Testing')
    case 'closing':
      return translate('codezera.pms.phase.closing', 'Closing')
  }
}

/**
 * The status column of the PMS status modal: every status by phase, the current one marked, and
 * only the moves the server workflow allows from it selectable.
 */
export function PmsStatusRail({
  current,
  selected,
  allowed,
  options,
  steps,
  disabled,
  onSelect
}: {
  current: string
  selected: string
  allowed: PmsStatusOption[]
  options: PmsStatusOption[]
  steps: Record<string, PmsStatusStep>
  disabled: boolean
  onSelect: (status: string) => void
}): React.JSX.Element {
  const allowedValues = new Set(allowed.map((option) => option.value))
  const known = [...options, ...allowed]
  return (
    <nav
      className="scrollbar-sleek flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border/50 bg-muted/20 px-2 py-3"
      aria-label={translate('codezera.pms.changeStatus', 'Change status')}
    >
      {(Object.keys(PMS_TICKET_STATUS_PHASES) as PmsTicketPhase[]).map((phase) => (
        <div key={phase} className="flex flex-col gap-0.5">
          <span className="px-2 pb-1 text-2xs font-medium text-muted-foreground">
            {phaseLabel(phase)}
          </span>
          {PMS_TICKET_STATUS_PHASES[phase].map((status: string) => {
            const isCurrent = status === current
            const isSelected = status === selected
            const selectable = isCurrent || allowedValues.has(status)
            const step = steps[status]
            return (
              <button
                key={status}
                type="button"
                disabled={disabled || !selectable}
                onClick={() => onSelect(status)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-[13px] transition',
                  isSelected ? 'bg-primary/12 text-foreground' : 'hover:bg-accent',
                  !selectable && 'cursor-not-allowed text-muted-foreground/60 hover:bg-transparent'
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-full border',
                      isSelected ? 'border-primary' : 'border-muted-foreground/50'
                    )}
                  >
                    {isSelected ? <span className="size-1.5 rounded-full bg-primary" /> : null}
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate', isSelected && 'font-medium')}>
                    {known.find((option) => option.value === status)?.label ?? status}
                  </span>
                  {isCurrent ? (
                    <History
                      className="size-3.5 shrink-0 text-primary"
                      aria-label={translate('codezera.pms.currentStatus', 'Current status')}
                    />
                  ) : null}
                </span>
                {step && step.state !== 'not_yet' && step.by ? (
                  <span className="flex w-full min-w-0 flex-col pl-5.5 text-2xs leading-tight text-muted-foreground">
                    <span className="truncate">{step.by}</span>
                    <span className="tabular-nums">{step.at.slice(0, 16)}</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
