import React, { useCallback, useEffect, useState } from 'react'
import { ChevronRight, CloudDownload, CloudUpload, GitCompareArrows, Loader2 } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { FileTypeIcon, FolderIcon } from '@/components/FileTypeIcon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import type { SftpRemoteEntry } from '../../../../shared/codezera/sftp-types'
import { openSftpCompare, sftpDownloadRemote, sftpUpload } from './sftp-actions'
import type { SftpWorkspace } from './sftp-store'

type DirectoryListing =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; entries: SftpRemoteEntry[] }

type SftpRemoteTreeProps = {
  workspace: SftpWorkspace
  remoteRoot: string
  localRoot: string
  /** Called when the root listing fails, so the panel can show the connection error. */
  onRootError: (message: string | null) => void
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Local counterpart of a remote path under remoteRoot. */
function localPathFor(localRoot: string, remoteRoot: string, remotePath: string): string {
  const relative = remotePath.slice(remoteRoot.length).replace(/^\/+/, '')
  const separator = localRoot.includes('\\') && !localRoot.includes('/') ? '\\' : '/'
  return relative ? `${localRoot}${separator}${relative.split('/').join(separator)}` : localRoot
}

/** Remote folders load on first expand; folders sort first, as the server listing returns them. */
export function SftpRemoteTree({
  workspace,
  remoteRoot,
  localRoot,
  onRootError
}: SftpRemoteTreeProps): React.JSX.Element {
  const [listings, setListings] = useState<Record<string, DirectoryListing>>({})
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const loadDirectory = useCallback(
    async (remoteDir: string) => {
      setListings((current) => ({ ...current, [remoteDir]: { status: 'loading' } }))
      try {
        const entries = await window.api.codezera.sftp.list({
          workspacePath: workspace.workspacePath,
          remotePath: remoteDir
        })
        setListings((current) => ({ ...current, [remoteDir]: { status: 'ready', entries } }))
        if (remoteDir === remoteRoot) {
          onRootError(null)
        }
      } catch (error) {
        const message = errorText(error)
        setListings((current) => ({ ...current, [remoteDir]: { status: 'error', message } }))
        if (remoteDir === remoteRoot) {
          onRootError(message)
        }
      }
    },
    [workspace.workspacePath, remoteRoot, onRootError]
  )

  useEffect(() => {
    void loadDirectory(remoteRoot)
  }, [loadDirectory, remoteRoot])

  const toggle = (entry: SftpRemoteEntry): void => {
    const next = new Set(expanded)
    if (next.has(entry.path)) {
      next.delete(entry.path)
    } else {
      next.add(entry.path)
      if (!listings[entry.path] || listings[entry.path]?.status === 'error') {
        void loadDirectory(entry.path)
      }
    }
    setExpanded(next)
  }

  const renderDirectory = (remoteDir: string, depth: number): React.ReactNode => {
    const listing = listings[remoteDir]
    const indent = { paddingLeft: depth * 16 + 8 }
    if (!listing || listing.status === 'loading') {
      return (
        <div className="flex items-center gap-1 py-1 text-xs text-muted-foreground" style={indent}>
          <Loader2 className="size-3 animate-spin" />
          {translate('codezera.sftp.loading', 'Loading…')}
        </div>
      )
    }
    if (listing.status === 'error') {
      // The root error is shown once by the panel header.
      return depth === 0 ? null : (
        <div
          className="truncate py-1 text-xs text-destructive"
          style={indent}
          title={listing.message}
        >
          {listing.message}
        </div>
      )
    }
    if (listing.entries.length === 0) {
      return (
        <div className="py-1 text-xs text-muted-foreground" style={indent}>
          {translate('codezera.sftp.emptyFolder', 'Empty folder')}
        </div>
      )
    }
    return listing.entries.map((entry) => {
      const isExpanded = expanded.has(entry.path)
      const localPath = localPathFor(localRoot, remoteRoot, entry.path)
      return (
        <React.Fragment key={entry.path}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left text-xs hover:bg-accent"
                style={indent}
                title={entry.path}
                onClick={() =>
                  entry.isDirectory ? toggle(entry) : openSftpCompare(workspace, localPath)
                }
              >
                {entry.isDirectory ? (
                  <>
                    <ChevronRight
                      className={cn(
                        'size-3 shrink-0 text-muted-foreground transition-transform',
                        isExpanded && 'rotate-90'
                      )}
                    />
                    <FolderIcon
                      folderPath={entry.name}
                      open={isExpanded}
                      className="size-3 shrink-0 text-muted-foreground"
                    />
                  </>
                ) : (
                  <>
                    <span className="size-3 shrink-0" />
                    <FileTypeIcon
                      filePath={entry.name}
                      className="size-3 shrink-0 text-muted-foreground"
                    />
                  </>
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
              <ContextMenuItem onSelect={() => void sftpDownloadRemote(workspace, entry.path)}>
                <CloudDownload className="size-3.5" />
                {translate('codezera.sftp.download', 'Download')}
              </ContextMenuItem>
              {!entry.isDirectory && (
                <>
                  <ContextMenuItem onSelect={() => openSftpCompare(workspace, localPath)}>
                    <GitCompareArrows className="size-3.5" />
                    {translate('codezera.sftp.diffWithLocal', 'Diff with local')}
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => void sftpUpload(workspace, localPath)}>
                    <CloudUpload className="size-3.5" />
                    {translate('codezera.sftp.uploadLocal', 'Upload local copy')}
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
          {entry.isDirectory && isExpanded && renderDirectory(entry.path, depth + 1)}
        </React.Fragment>
      )
    })
  }

  return <div className="py-1">{renderDirectory(remoteRoot, 0)}</div>
}
