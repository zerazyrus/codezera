import React, { useEffect, useMemo } from 'react'
import { CloudDownload, CloudUpload, GitCompareArrows } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { openSftpCompare, sftpDownloadLocal, sftpUpload } from './sftp-actions'
import { ensureSftpStateLoaded, findSftpWorkspacePathFor, useSftpStore } from './sftp-store'

/** SFTP entries for Orca's file explorer row menu; renders nothing unless the row's workspace has an SFTP config. */
export function CodezeraSftpExplorerMenuItems({
  path,
  isDirectory,
  worktreeId
}: {
  path: string
  isDirectory: boolean
  worktreeId: string | null
}): React.JSX.Element | null {
  useEffect(() => ensureSftpStateLoaded(worktreeId), [worktreeId])
  const workspacePath = useSftpStore((s) => findSftpWorkspacePathFor(s.states, path))
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
