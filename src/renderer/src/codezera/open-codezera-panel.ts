import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { CodezeraPanel } from '../../../shared/codezera/codezera-panel'

/**
 * Opens (or focuses) the worktree's singleton tab for `panel`, beside its terminals and editors.
 * Goes through Orca's `openFile` so the tab joins the layout the same way any editor tab does.
 */
export function openCodezeraPanel(worktreeId: string, panel: CodezeraPanel): void {
  const label = translate('codezera.gitGraph.title', 'Git Graph')
  useAppStore.getState().openFile(
    {
      filePath: `${worktreeId}::codezera::${panel}`,
      relativePath: label,
      worktreeId,
      language: 'plaintext',
      mode: 'codezera-panel',
      codezeraPanel: panel,
      runtimeEnvironmentId: null
    },
    { preview: false }
  )
}
