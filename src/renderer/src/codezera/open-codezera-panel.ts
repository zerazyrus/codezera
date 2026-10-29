import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { OpenFile } from '@/store/slices/editor'
import { openWorkspaceEditorItem } from '@/store/slices/editor/tabs/workspace-editor-item'
import type { CodezeraPanel } from '../../../shared/codezera/codezera-panel'

function panelLabel(panel: CodezeraPanel): string {
  switch (panel) {
    case 'git-graph':
      return translate('codezera.gitGraph.title', 'Git Graph')
  }
}

/** Opens (or focuses) the worktree's singleton tab for `panel`, beside its terminals and editors. */
export function openCodezeraPanel(worktreeId: string, panel: CodezeraPanel): void {
  const id = codezeraPanelTabId(worktreeId, panel)
  const label = panelLabel(panel)
  useAppStore.setState((s) => {
    const exists = s.openFiles.some((file) => file.id === id)
    const file: OpenFile = {
      id,
      filePath: id,
      relativePath: label,
      worktreeId,
      language: 'plaintext',
      isDirty: false,
      mode: 'codezera-panel',
      codezeraPanel: panel
    }
    return {
      openFiles: exists ? s.openFiles : [...s.openFiles, file],
      activeFileId: id,
      activeTabType: 'editor',
      activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
      activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
    }
  })
  openWorkspaceEditorItem(useAppStore.getState(), id, worktreeId, label, 'check-details')
}

export function codezeraPanelTabId(worktreeId: string, panel: CodezeraPanel): string {
  return `${worktreeId}::codezera::${panel}`
}
