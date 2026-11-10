import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { CloudDownload, CloudUpload, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { translate } from '@/i18n/i18n'
import { detectLanguage } from '../../../../shared/editor-language/editor-language-detect'
import { SftpToolbarButton as ToolbarButton } from './sftp-toolbar-button'
import { readRuntimeFileContent } from '@/runtime/files/reads/runtime-file-read-client'
import { writeRuntimeFile } from '@/runtime/files/mutations/runtime-file-mutation-client'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import type { SftpRemoteFile } from '../../../../shared/codezera/sftp-types'
import {
  onCodezeraFileSaved,
  sftpCompareLocalPath,
  sftpDownloadLocal,
  sftpUpload
} from './sftp-actions'
import { useSftpWorkspacePath, type SftpWorkspace } from './sftp-store'

const DiffViewer = lazy(() => import('@/components/editor/diff/monaco-view/DiffViewer'))

type CompareContent =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; remote: SftpRemoteFile; local: string; localExists: boolean; revision: number }

async function readLocal(workspace: SftpWorkspace, localPath: string): Promise<string | null> {
  try {
    const result = await readRuntimeFileContent({
      target: { kind: 'local' },
      filePath: localPath,
      worktreeId: workspace.worktreeId
    })
    if (result.isBinary) {
      throw new Error(translate('codezera.sftp.binary', 'Binary files cannot be compared.'))
    }
    return result.content
  } catch (error) {
    // A file that exists only on the server still compares against an empty local side.
    if (error instanceof Error && /ENOENT|no such file/i.test(error.message)) {
      return null
    }
    throw error
  }
}

/** Body of an `sftp-compare` tab: the server copy (left, read-only) against the local file (right, editable). */
function SftpCompareView({
  file,
  workspace
}: {
  file: OpenFile
  workspace: SftpWorkspace
}): React.JSX.Element {
  const localPath = sftpCompareLocalPath(file.filePath)
  const [content, setContent] = useState<CompareContent>({ kind: 'loading' })

  const load = useCallback(async () => {
    if (!localPath) {
      return
    }
    setContent({ kind: 'loading' })
    try {
      const [remote, local] = await Promise.all([
        window.api.codezera.sftp.readRemoteFile({
          workspacePath: workspace.workspacePath,
          localPath
        }),
        readLocal(workspace, localPath)
      ])
      setContent({
        kind: 'ready',
        remote,
        local: local ?? '',
        localExists: local !== null,
        revision: Date.now()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setContent({
        kind: 'error',
        message: message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
      })
    }
  }, [localPath, workspace])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    async (next: string) => {
      if (!localPath) {
        return
      }
      const context = {
        target: { kind: 'local' as const },
        worktreeId: workspace.worktreeId,
        worktreePath: workspace.workspacePath
      }
      try {
        await writeRuntimeFile(context, localPath, next)
        onCodezeraFileSaved(localPath, context)
      } catch (error) {
        toast.error(translate('codezera.sftp.saveFailed', 'Could not save the local file'), {
          description: error instanceof Error ? error.message : String(error)
        })
      }
    },
    [localPath, workspace]
  )

  if (!localPath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate('codezera.sftp.compareMissing', 'Nothing to compare.')}
      </div>
    )
  }

  const relativePath = localPath.startsWith(workspace.workspacePath)
    ? localPath.slice(workspace.workspacePath.length).replace(/^[\\/]/, '')
    : localPath

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor-surface">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={relativePath}>
          {content.kind === 'ready'
            ? translate('codezera.sftp.compareSides', '{{server}} ↔ local · {{path}}', {
                server: content.remote.label,
                path: relativePath
              })
            : relativePath}
        </span>
        {content.kind === 'ready' && !content.remote.exists && (
          <span className="shrink-0 text-muted-foreground">
            {translate('codezera.sftp.notOnServer', 'Not on server')}
          </span>
        )}
        {content.kind === 'ready' && !content.localExists && (
          <span className="shrink-0 text-muted-foreground">
            {translate('codezera.sftp.notLocal', 'Not on this computer')}
          </span>
        )}
        <ToolbarButton
          label={translate('codezera.sftp.uploadLocal', 'Upload local copy')}
          onClick={() => void sftpUpload(workspace, localPath).then(load)}
        >
          <CloudUpload className="size-3" />
        </ToolbarButton>
        <ToolbarButton
          label={translate('codezera.sftp.downloadServer', 'Download server copy')}
          onClick={() => void sftpDownloadLocal(workspace, localPath).then(load)}
        >
          <CloudDownload className="size-3" />
        </ToolbarButton>
        <ToolbarButton
          label={translate('codezera.sftp.refresh', 'Refresh')}
          onClick={() => void load()}
        >
          <RefreshCw className="size-3" />
        </ToolbarButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {content.kind === 'loading' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {translate('codezera.sftp.loadingCompare', 'Reading server and local copies…')}
          </div>
        ) : content.kind === 'error' ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {content.message}
          </div>
        ) : (
          <Suspense fallback={null}>
            <DiffViewer
              key={content.revision}
              modelKey={`sftp-compare:${file.id}:${content.revision}`}
              originalContent={content.remote.content}
              modifiedContent={content.local}
              language={detectLanguage(localPath)}
              filePath={localPath}
              relativePath={relativePath}
              sideBySide
              editable
              worktreeId={workspace.worktreeId}
              onSave={(next) => void save(next)}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}

export function SftpCompareTab({ file }: { file: OpenFile }): React.JSX.Element {
  const workspacePath = useSftpWorkspacePath(file.worktreeId)
  const workspace = useMemo(
    () => (workspacePath ? { worktreeId: file.worktreeId, workspacePath } : null),
    [file.worktreeId, workspacePath]
  )
  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {translate('codezera.sftp.localOnly', 'SFTP works with workspaces on this computer only.')}
      </div>
    )
  }
  return <SftpCompareView file={file} workspace={workspace} />
}
