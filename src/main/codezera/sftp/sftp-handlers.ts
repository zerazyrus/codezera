import { app, BrowserWindow, ipcMain } from 'electron'
import { isAbsolute, join } from 'node:path'
import type { Store } from '../../persistence/loading-store/store'
import type {
  SftpConfigState,
  SftpLocalPathRequest,
  SftpRemoteEntry,
  SftpRemoteFile,
  SftpRemotePathRequest,
  SftpSaveProfileRequest,
  SftpTransferResult,
  SftpVsCodeImportAllResult,
  SftpVsCodeImportResult,
  SftpWorkspaceRequest
} from '../../../shared/codezera/sftp-types'
import { splitWorktreeIdForFilesystem } from '../../../shared/worktree/id'
import { resolveUserSshConfigHost } from '../../ssh/config/ssh-config-host-picker'
import {
  getRegisteredSshTargetMutations,
  listRegisteredSshTargets
} from '../../ssh/targets/ssh-target-registry'
import { SftpConnectionStore } from './sftp-connection-store'
import { SftpWorkspaceService } from './sftp-workspace-service'

const CONFIG_CHANGED_CHANNEL = 'codezera:sftp:configChanged'

function requireAbsolute(path: unknown, field: string): string {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    throw new Error(`${field} must be an absolute path`)
  }
  return path
}

/** Local repo, worktree and folder-workspace roots Orca knows about. */
function knownLocalWorkspacePaths(store: Store): string[] {
  const localRepos = store
    .getRepos()
    .filter(
      (repo) => !repo.connectionId && (!repo.executionHostId || repo.executionHostId === 'local')
    )
  const localRepoIds = new Set(localRepos.map((repo) => repo.id))
  const paths = new Set(localRepos.map((repo) => repo.path))
  for (const worktreeId of Object.keys(store.getAllWorktreeMeta())) {
    const parsed = splitWorktreeIdForFilesystem(worktreeId)
    if (parsed && localRepoIds.has(parsed.repoId) && isAbsolute(parsed.worktreePath)) {
      paths.add(parsed.worktreePath)
    }
  }
  for (const folder of store.getFolderWorkspaces()) {
    if (!folder.connectionId && isAbsolute(folder.folderPath)) {
      paths.add(folder.folderPath)
    }
  }
  return [...paths]
}

export function registerCodezeraSftpHandlers(store: Store): void {
  const service = new SftpWorkspaceService(
    new SftpConnectionStore(join(app.getPath('userData'), 'codezera', 'sftp-connections.json')),
    {
      listTargets: listRegisteredSshTargets,
      addTarget: async (input) => (await getRegisteredSshTargetMutations().add(input)).target,
      resolveAlias: async (alias) => {
        const resolved = await resolveUserSshConfigHost(alias).catch(() => null)
        return resolved
          ? { hostname: resolved.hostname, port: resolved.port, username: resolved.username }
          : null
      }
    },
    (workspacePath) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(CONFIG_CHANGED_CHANNEL, workspacePath)
      }
    }
  )
  app.once('will-quit', () => service.dispose())

  ipcMain.handle(
    'codezera:sftp:getState',
    (_event, args: SftpWorkspaceRequest): Promise<SftpConfigState> =>
      service.getState(requireAbsolute(args.workspacePath, 'workspacePath'))
  )
  ipcMain.handle(
    'codezera:sftp:setProfile',
    (_event, args: SftpWorkspaceRequest & { profile: string }): Promise<SftpConfigState> =>
      service.setProfile(requireAbsolute(args.workspacePath, 'workspacePath'), String(args.profile))
  )
  ipcMain.handle(
    'codezera:sftp:saveProfile',
    (_event, args: SftpSaveProfileRequest): Promise<SftpConfigState> =>
      service.saveProfile({
        ...args,
        workspacePath: requireAbsolute(args.workspacePath, 'workspacePath')
      })
  )
  ipcMain.handle(
    'codezera:sftp:deleteProfile',
    (_event, args: SftpWorkspaceRequest & { profile: string }): Promise<SftpConfigState> =>
      service.deleteProfile(
        requireAbsolute(args.workspacePath, 'workspacePath'),
        String(args.profile)
      )
  )
  ipcMain.handle(
    'codezera:sftp:importFromVsCode',
    (_event, args: SftpWorkspaceRequest): Promise<SftpVsCodeImportResult> =>
      service.importFromVsCode(requireAbsolute(args.workspacePath, 'workspacePath'))
  )
  ipcMain.handle('codezera:sftp:importAllFromVsCode', (): Promise<SftpVsCodeImportAllResult> =>
    service.importAllFromVsCode(knownLocalWorkspacePaths(store))
  )
  ipcMain.handle(
    'codezera:sftp:list',
    (_event, args: SftpRemotePathRequest): Promise<SftpRemoteEntry[]> =>
      service.list(requireAbsolute(args.workspacePath, 'workspacePath'), String(args.remotePath))
  )
  ipcMain.handle(
    'codezera:sftp:downloadRemote',
    (_event, args: SftpRemotePathRequest): Promise<SftpTransferResult> =>
      service.downloadRemote(
        requireAbsolute(args.workspacePath, 'workspacePath'),
        String(args.remotePath)
      )
  )
  ipcMain.handle(
    'codezera:sftp:downloadLocal',
    (_event, args: SftpLocalPathRequest): Promise<SftpTransferResult> =>
      service.downloadLocal(
        requireAbsolute(args.workspacePath, 'workspacePath'),
        requireAbsolute(args.localPath, 'localPath')
      )
  )
  ipcMain.handle(
    'codezera:sftp:upload',
    (_event, args: SftpLocalPathRequest): Promise<SftpTransferResult> =>
      service.upload(
        requireAbsolute(args.workspacePath, 'workspacePath'),
        requireAbsolute(args.localPath, 'localPath')
      )
  )
  ipcMain.handle(
    'codezera:sftp:uploadOnSave',
    (_event, args: SftpLocalPathRequest): Promise<SftpTransferResult | null> =>
      service.uploadOnSave(
        requireAbsolute(args.workspacePath, 'workspacePath'),
        requireAbsolute(args.localPath, 'localPath')
      )
  )
  ipcMain.handle(
    'codezera:sftp:readRemoteFile',
    (_event, args: SftpLocalPathRequest): Promise<SftpRemoteFile> =>
      service.readRemoteFile(
        requireAbsolute(args.workspacePath, 'workspacePath'),
        requireAbsolute(args.localPath, 'localPath')
      )
  )
  ipcMain.handle(
    'codezera:sftp:sshCommand',
    (_event, args: SftpWorkspaceRequest): Promise<string> =>
      service.sshCommand(requireAbsolute(args.workspacePath, 'workspacePath'))
  )
  ipcMain.handle('codezera:sftp:disconnect', (_event, args: SftpWorkspaceRequest): void => {
    service.invalidate(requireAbsolute(args.workspacePath, 'workspacePath'))
  })
}
