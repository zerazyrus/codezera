import type React from 'react'
import { GitGraph } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGitGraphDock } from './git-graph-dock-store'

export function OpenGitGraphButton({ className }: { className?: string }): React.JSX.Element {
  const open = useGitGraphDock((s) => s.open)
  const label = open
    ? translate('codezera.gitGraph.closeButton', 'Close Git Graph')
    : translate('codezera.gitGraph.openButton', 'Open Git Graph')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={className}
          aria-label={label}
          aria-pressed={open}
          data-testid="open-git-graph"
          onClick={(event) => {
            event.stopPropagation()
            useGitGraphDock.getState().setOpen(!open)
          }}
        >
          <GitGraph className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
