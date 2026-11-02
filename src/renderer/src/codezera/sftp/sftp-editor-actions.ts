import type { editor } from 'monaco-editor'
import { translate } from '@/i18n/i18n'
import { openSftpCompare, sftpDownloadLocal, sftpUpload } from './sftp-actions'
import {
  ensureSftpStateLoaded,
  findSftpWorkspacePathFor,
  useSftpStore,
  type SftpWorkspace
} from './sftp-store'

type SftpFileAction = (workspace: SftpWorkspace, filePath: string) => unknown

const SFTP_EDITOR_ITEMS: [id: string, label: () => string, action: SftpFileAction][] = [
  ['uploadFile', () => translate('codezera.sftp.editorUpload', 'SFTP: Upload File'), sftpUpload],
  [
    'downloadFile',
    () => translate('codezera.sftp.editorDownload', 'SFTP: Download File'),
    sftpDownloadLocal
  ],
  [
    'diffWithRemote',
    () => translate('codezera.sftp.menuDiff', 'SFTP: Diff with Remote'),
    openSftpCompare
  ]
]

/**
 * VS Code SFTP-style editor context menu items (Upload / Download / Diff with Remote) for the
 * open file. Added on right-click only when the file has an SFTP config, so other workspaces never
 * see them; disposes itself with the editor.
 */
export function installSftpEditorActions(
  editorInstance: editor.IStandaloneCodeEditor,
  worktreeId: string | undefined
): void {
  let actions: { dispose: () => void }[] = []
  const resolveTarget = (): { workspace: SftpWorkspace; filePath: string } | null => {
    const uri = editorInstance.getModel()?.uri
    // Editor tabs of local files use file:// models; diff, untitled and remote models do not.
    if (!worktreeId || uri?.scheme !== 'file') {
      return null
    }
    const workspacePath = findSftpWorkspacePathFor(useSftpStore.getState().states, uri.fsPath)
    return workspacePath ? { workspace: { worktreeId, workspacePath }, filePath: uri.fsPath } : null
  }
  const run = (action: SftpFileAction) => () => {
    const target = resolveTarget()
    if (target) {
      void action(target.workspace, target.filePath)
    }
  }
  // Runs on mousedown, before Monaco builds the context menu from the registered actions.
  const syncActions = (): void => {
    const wanted = resolveTarget() !== null
    if (wanted === actions.length > 0) {
      return
    }
    for (const action of actions) {
      action.dispose()
    }
    actions = wanted
      ? SFTP_EDITOR_ITEMS.map(([id, label, action], index) =>
          editorInstance.addAction({
            id: `codezera.sftp.${id}`,
            label: label(),
            contextMenuGroupId: 'codezera_sftp',
            contextMenuOrder: index + 1,
            run: run(action)
          })
        )
      : []
  }
  const mouseDown = editorInstance.onMouseDown((event) => {
    if (event.event.rightButton) {
      // The SFTP activity tab normally loaded it already; this covers a never-mounted right sidebar.
      ensureSftpStateLoaded(worktreeId)
      syncActions()
    }
  })
  editorInstance.onDidDispose(() => {
    mouseDown.dispose()
    for (const action of actions) {
      action.dispose()
    }
  })
}
