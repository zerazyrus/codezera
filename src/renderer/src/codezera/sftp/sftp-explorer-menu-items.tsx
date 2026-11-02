import React, { useMemo } from 'react'
import { CloudDownload, CloudUpload, GitCompareArrows } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { openSftpCompare, sftpDownloadLocal, sftpUpload } from './sftp-actions'
import { useSftpStore } from './sftp-store'

function isInside(root: string, path: string): boolean {
  return path === root || (path.startsWith(root) && /^[\\/]/.test(path.slice(root.length)))
}

/**
 * SFTP entries for Orca's file explorer row menu; renders nothing unless the row lies under a
 * workspace whose sftp.json the SFTP tab already loaded (it loads for the active local workspace).
 */
export function CodezeraSftpExplorerMenuItems({
  path,
  isDirectory,
  worktreeId
}: {
  path: string
  isDirectory: boolean
  worktreeId: string | null
}): React.JSX.Element | null {
  const workspacePath = useSftpStore((s) => {
    for (const [key, state] of Object.entries(s.states)) {
      if (state?.status === 'ok' && isInside(state.summary.localRoot, path)) {
        return key
      }
    }
    return null
  })
  const workspace = useMemo(
    () => (worktreeId && workspacePath ? { worktreeId, workspacePath } : null),
    [worktreeId, workspacePath]
  )
  if (!workspace) {
    return null
  }
  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => void sftpUpload(workspace, path)}>
        <CloudUpload />
        {translate('codezera.sftp.menuUpload', 'SFTP: Upload')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void sftpDownloadLocal(workspace, path)}>
        <CloudDownload />
        {translate('codezera.sftp.menuDownload', 'SFTP: Download')}
      </ContextMenuItem>
      {!isDirectory && (
        <ContextMenuItem onSelect={() => openSftpCompare(workspace, path)}>
          <GitCompareArrows />
          {translate('codezera.sftp.menuDiff', 'SFTP: Diff with Remote')}
        </ContextMenuItem>
      )}
    </>
  )
}
