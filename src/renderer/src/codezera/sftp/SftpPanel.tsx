import React, { useCallback, useMemo, useState } from 'react'
import {
  CloudUpload,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  ServerCog,
  SquareTerminal
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useActiveWorktreeId } from '@/store/workspaces/selection/use-selected-worktree'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { Button } from '@/components/ui/button'
import { SftpToolbarButton as ToolbarButton } from './sftp-toolbar-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { SftpConfigState } from '../../../../shared/codezera/sftp-types'
import { openSftpCompare, openSftpTerminal, sftpErrorText, sftpUpload } from './sftp-actions'
import { SftpRemoteTree } from './sftp-remote-tree'
import { SftpEmptyState, SftpProfileMenu } from './sftp-profile-controls'
import { useSftpState, useSftpStore, useSftpWorkspacePath, type SftpWorkspace } from './sftp-store'

function PanelMessage({
  title,
  children
}: {
  title: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
      <ServerCog className="size-8 opacity-50" />
      <p className="text-sm">{title}</p>
      {children && <div className="text-xs">{children}</div>}
    </div>
  )
}

/** Editor file of this workspace that toolbar actions apply to, if any. */
function useActiveLocalFile(worktreeId: string): string | null {
  return useAppStore((s) => {
    const file = s.openFiles.find((entry) => entry.id === s.activeFileId)
    return file && file.mode === 'edit' && file.worktreeId === worktreeId ? file.filePath : null
  })
}

function SftpWorkspaceView({
  workspace,
  state
}: {
  workspace: SftpWorkspace
  state: Extract<SftpConfigState, { status: 'ok' }>
}): React.JSX.Element {
  const { summary } = state
  const revision = useSftpStore((s) => s.revisions[workspace.workspacePath] ?? 0)
  const [refreshCount, setRefreshCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const activeFile = useActiveLocalFile(workspace.worktreeId)
  const activeFileInRoot =
    activeFile !== null &&
    activeFile.startsWith(summary.localRoot) &&
    /^[\\/]/.test(activeFile.slice(summary.localRoot.length))
      ? activeFile
      : null

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await window.api.codezera.sftp.disconnect({ workspacePath: workspace.workspacePath })
      await useSftpStore.getState().load(workspace.workspacePath)
      setRefreshCount((count) => count + 1)
    } finally {
      setRefreshing(false)
    }
  }

  const switchProfile = (profile: string): void => {
    window.api.codezera.sftp
      .setProfile({ workspacePath: workspace.workspacePath, profile })
      .then((next) => useSftpStore.getState().apply(workspace.workspacePath, next))
      .catch((error: unknown) =>
        toast.error(translate('codezera.sftp.profileFailed', 'Cannot switch profile'), {
          description: sftpErrorText(error)
        })
      )
  }

  const noActiveFile = translate(
    'codezera.sftp.noActiveFile',
    'Open a file of this workspace in the editor first'
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 min-h-8 items-center gap-1 border-b border-border px-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {translate('codezera.sftp.title', 'SFTP')}
        </span>
        <ToolbarButton
          label={
            activeFileInRoot
              ? translate('codezera.sftp.uploadActive', 'Upload active file')
              : noActiveFile
          }
          disabled={!activeFileInRoot}
          onClick={() => activeFileInRoot && void sftpUpload(workspace, activeFileInRoot)}
        >
          <CloudUpload className="size-3" />
        </ToolbarButton>
        <ToolbarButton
          label={
            activeFileInRoot
              ? translate('codezera.sftp.diffActive', 'Diff active file with server')
              : noActiveFile
          }
          disabled={!activeFileInRoot}
          onClick={() => activeFileInRoot && openSftpCompare(workspace, activeFileInRoot)}
        >
          <GitCompareArrows className="size-3" />
        </ToolbarButton>
        <ToolbarButton
          label={translate('codezera.sftp.openTerminal', 'Open SSH terminal')}
          onClick={() => void openSftpTerminal(workspace)}
        >
          <SquareTerminal className="size-3" />
        </ToolbarButton>
        <ToolbarButton
          label={translate('codezera.sftp.refresh', 'Refresh')}
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
        </ToolbarButton>
        <SftpProfileMenu
          workspacePath={workspace.workspacePath}
          connections={state.connections}
          hasVsCodeConfig={state.hasVsCodeConfig}
        />
      </div>
      <div className="flex flex-col gap-1 border-b border-border px-2 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {translate('codezera.sftp.profile', 'Profile')}
          </span>
          <Select value={summary.activeProfile} onValueChange={switchProfile}>
            <SelectTrigger size="sm" className="h-6 min-w-0 flex-1 px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {summary.profiles.map((profile) => (
                <SelectItem key={profile} value={profile} className="text-xs">
                  {profile}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div
          className="flex items-center gap-1.5 text-muted-foreground"
          title={summary.hostLabel ?? undefined}
        >
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              summary.endpointError || connectionError ? 'bg-destructive' : 'bg-muted-foreground'
            )}
          />
          <span className="truncate">
            {summary.endpoint ??
              summary.hostLabel ??
              translate('codezera.sftp.hostMissing', 'SSH host removed')}
          </span>
          {summary.uploadOnSave && (
            <span className="ml-auto shrink-0">
              {translate('codezera.sftp.uploadOnSave', 'Upload on save')}
            </span>
          )}
        </div>
        <div className="truncate text-muted-foreground" title={summary.remotePath}>
          {summary.remotePath}
        </div>
        {(summary.endpointError ?? connectionError) && (
          <div className="break-words text-destructive">
            {summary.endpointError ?? connectionError}
          </div>
        )}
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        {!summary.endpointError && (
          <SftpRemoteTree
            key={`${summary.activeProfile}:${summary.remotePath}:${revision}:${refreshCount}`}
            workspace={workspace}
            remoteRoot={summary.remotePath}
            localRoot={summary.localRoot}
            onRootError={setConnectionError}
          />
        )}
      </div>
    </div>
  )
}

export default function SftpPanel(): React.JSX.Element {
  const worktreeId = useActiveWorktreeId()
  const workspacePath = useSftpWorkspacePath(worktreeId)
  const state = useSftpState(workspacePath)
  const workspace = useMemo(
    () => (worktreeId && workspacePath ? { worktreeId, workspacePath } : null),
    [worktreeId, workspacePath]
  )
  const reload = useCallback(() => {
    if (workspacePath) {
      void useSftpStore.getState().load(workspacePath)
    }
  }, [workspacePath])

  if (!workspace) {
    return (
      <PanelMessage
        title={translate(
          'codezera.sftp.localOnly',
          'SFTP works with workspaces on this computer only.'
        )}
      />
    )
  }
  if (!state) {
    return (
      <PanelMessage title={translate('codezera.sftp.loadingConfig', 'Reading SFTP settings…')} />
    )
  }
  if (state.status === 'missing') {
    return (
      <SftpEmptyState
        workspacePath={workspace.workspacePath}
        hasVsCodeConfig={state.hasVsCodeConfig}
      />
    )
  }
  if (state.status === 'invalid') {
    return (
      <PanelMessage title={translate('codezera.sftp.invalidTitle', 'SFTP settings cannot be read')}>
        <p className="mb-2 text-destructive">{state.error}</p>
        <Button type="button" size="xs" variant="outline" onClick={reload}>
          {translate('codezera.sftp.retry', 'Retry')}
        </Button>
      </PanelMessage>
    )
  }
  return <SftpWorkspaceView workspace={workspace} state={state} />
}
