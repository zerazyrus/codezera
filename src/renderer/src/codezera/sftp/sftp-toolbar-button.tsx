import type React from 'react'
import { cn } from '@/lib/class-names'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Icon button with a tooltip, matching the file explorer toolbar. */
export function SftpToolbarButton({
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
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            'text-muted-foreground hover:text-foreground',
            disabled && 'cursor-not-allowed opacity-50'
          )}
          aria-label={label}
          aria-disabled={disabled}
          // Native disabled buttons suppress Radix tooltip triggers in Chromium.
          onClick={(event) => {
            if (disabled) {
              event.preventDefault()
              return
            }
            onClick()
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
