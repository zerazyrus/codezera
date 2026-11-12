import type React from 'react'
import { cn } from '@/lib/class-names'
import type { PmsStatusOption } from '../../../../shared/codezera/pms-types'

/** Status with the dot color PMS assigns, so it reads the same as the PMS web and CloudWORK app. */
export function PmsStatusLabel({
  status,
  options,
  className
}: {
  status: string
  options: PmsStatusOption[] | undefined
  className?: string
}): React.JSX.Element {
  const option = options?.find((entry) => entry.value === status)
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={option?.color ? { backgroundColor: option.color } : undefined}
      />
      <span className="truncate">{option?.label ?? status}</span>
    </span>
  )
}

/** The status as a pill tinted with its PMS color, like the dashboard's status column. */
export function PmsStatusBadge({
  status,
  options,
  className
}: {
  status: string
  options: PmsStatusOption[] | undefined
  className?: string
}): React.JSX.Element {
  const option = options?.find((entry) => entry.value === status)
  const color = option?.color
  return (
    <span
      className={cn(
        'inline-flex max-w-full min-w-0 items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-foreground',
        className
      )}
      style={
        color
          ? {
              backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
              borderColor: `color-mix(in srgb, ${color} 45%, transparent)`
            }
          : undefined
      }
    >
      <span className="truncate">{option?.label ?? status}</span>
    </span>
  )
}
