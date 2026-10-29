import type React from 'react'
import { translate } from '@/i18n/i18n'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import type { GitHistoryItem } from '../../../../shared/git-history'
import { GIT_GRAPH_STASH_REF_PREFIX } from '../../../../shared/codezera/git-graph-types'
import type { GitGraphRequest } from './git-graph-request'

/** `stash@{N}` for rows the main process inserted from `git stash list`, else null. */
export function gitGraphStashSelector(item: GitHistoryItem): string | null {
  const ref = item.references?.find((candidate) =>
    candidate.id.startsWith(GIT_GRAPH_STASH_REF_PREFIX)
  )
  return ref ? ref.name : null
}

export function GitGraphStashMenuContent({
  selector,
  onRequest
}: {
  selector: string
  onRequest: (request: GitGraphRequest) => void
}): React.JSX.Element {
  return (
    <ContextMenuContent className="w-60">
      <ContextMenuItem
        onSelect={() =>
          onRequest({
            kind: 'run',
            label: translate('codezera.gitGraph.stash.apply', 'Apply stash'),
            action: { kind: 'stash', operation: 'apply', selector }
          })
        }
      >
        {translate('codezera.gitGraph.stash.applyItem', 'Apply stash')}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          onRequest({
            kind: 'run',
            label: translate('codezera.gitGraph.stash.pop', 'Pop stash'),
            action: { kind: 'stash', operation: 'pop', selector }
          })
        }
      >
        {translate('codezera.gitGraph.stash.popItem', 'Pop stash')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onSelect={() =>
          onRequest({
            kind: 'confirm',
            title: translate('codezera.gitGraph.stash.dropTitle', 'Drop stash'),
            description: translate(
              'codezera.gitGraph.stash.dropDescription',
              'Permanently deletes {{selector}}.',
              { selector }
            ),
            action: { kind: 'stash', operation: 'drop', selector },
            destructive: true
          })
        }
      >
        {translate('codezera.gitGraph.stash.dropItem', 'Drop stash…')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
