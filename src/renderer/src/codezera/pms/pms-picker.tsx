import React, { useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/class-names'
import { translate } from './pms-i18n'
import { PmsStatusLabel } from './pms-status-label'
import type { PmsStatusOption } from '../../../../shared/codezera/pms-types'

export type PmsPickOption = {
  value: string
  /** Searched text; also shown when `node` is absent. */
  label: string
  node?: React.ReactNode
  disabled?: boolean
}

/** Status values as picker rows with their PMS color dot, searchable by the PMS label. */
export function pmsStatusPicks(
  statuses: readonly string[],
  options: PmsStatusOption[] | undefined
): PmsPickOption[] {
  return statuses.map((status) => ({
    value: status,
    label: options?.find((option) => option.value === status)?.label ?? status,
    node: <PmsStatusLabel status={status} options={options} />
  }))
}

/** "Đang kiểm thử" and "dang kiem thu" match: people type PMS values without accents. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
}

/** PMS picklist: a select with a search box, since PMS lists run to dozens of values. */
export function PmsPicker({
  value,
  onChange,
  options,
  placeholder,
  display,
  disabled,
  className,
  ariaLabel
}: {
  value: string
  onChange: (value: string) => void
  options: readonly PmsPickOption[]
  placeholder?: string
  /** Trigger content when the selected value is not one of `options` (e.g. "All statuses"). */
  display?: React.ReactNode
  disabled?: boolean
  className?: string
  ariaLabel?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.value === value)
  const shown = useMemo(() => {
    const needle = fold(query.trim())
    return needle ? options.filter((option) => fold(option.label).includes(needle)) : options
  }, [options, query])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery('')
        }
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            'flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-[13px] whitespace-nowrap shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
            className
          )}
        >
          <span
            className={cn(
              'flex min-w-0 items-center truncate',
              !selected && !display && 'text-muted-foreground'
            )}
          >
            {selected
              ? (selected.node ?? selected.label)
              : (display ?? placeholder ?? translate('codezera.pms.choose', 'Choose…'))}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(360px,calc(100vw-1rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={translate('codezera.pms.pickSearch', 'Search…')}
            className="text-[13px]"
          />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-4 text-center text-[13px] text-muted-foreground">
              {translate('codezera.pms.pickEmpty', 'No match')}
            </CommandEmpty>
            {shown.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="text-[13px]"
                onSelect={() => {
                  onChange(option.value)
                  setOpen(false)
                  setQuery('')
                }}
              >
                <span className="flex min-w-0 flex-1 items-center truncate">
                  {option.node ?? option.label}
                </span>
                <Check
                  className={cn('size-3.5', option.value === value ? 'opacity-100' : 'opacity-0')}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
