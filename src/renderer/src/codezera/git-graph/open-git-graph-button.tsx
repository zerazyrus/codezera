import type React from 'react'
import { GitGraph } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { openCodezeraPanel } from '../open-codezera-panel'

export function OpenGitGraphButton({ className }: { className?: string }): React.JSX.Element {
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  const label = translate('codezera.gitGraph.openButton', 'Open Git Graph')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={className}
          aria-label={label}
          disabled={!worktreeId}
          data-testid="open-git-graph"
          onClick={(event) => {
            event.stopPropagation()
            if (worktreeId) {
              openCodezeraPanel(worktreeId, 'git-graph')
            }
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
