import { app, BrowserWindow, ipcMain } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { Store } from '../../persistence/loading-store/store'
import type {
  SftpConfigState,
  SftpLocalPathRequest,
  SftpRemoteEntry,
  SftpRemoteFile,
  SftpRemotePathRequest,
  SftpTransferResult,
  SftpWorkspaceRequest
} from '../../../shared/codezera/sftp-types'
import { SftpProfileStore } from './sftp-profile-store'
import { SftpWorkspaceService } from './sftp-workspace-service'

const CONFIG_CHANGED_CHANNEL = 'codezera:sftp:configChanged'

function requireAbsolute(path: unknown, field: string): string {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    throw new Error(`${field} must be an absolute path`)
  }
  return path
}

/** Notifies renderers when a watched workspace's `.vscode` folder changes sftp.json. */
function createConfigWatchers(service: SftpWorkspaceService): {
  ensure: (workspacePath: string) => void
  closeAll: () => void
} {
  const watchers = new Map<string, FSWatcher | null>()
  return {
    ensure: (workspacePath) => {
      if (watchers.get(workspacePath)) {
        return
      }
      try {
        const watcher = watch(join(workspacePath, '.vscode'), (_event, filename) => {
          if (filename && filename !== 'sftp.json') {
            return
          }
          service.invalidate(workspacePath)
          for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send(CONFIG_CHANGED_CHANNEL, workspacePath)
          }
        })
        watcher.on('error', () => {
          watcher.close()
          watchers.delete(workspacePath)
        })
        watchers.set(workspacePath, watcher)
      } catch {
        // No .vscode folder yet; the panel's refresh picks the file up once it exists.
        watchers.set(workspacePath, null)
      }
    },
    closeAll: () => {
      for (const watcher of watchers.values()) {
        watcher?.close()
      }
      watchers.clear()
    }
  }
}

export function registerCodezeraSftpHandlers(store: Store): void {
  const service = new SftpWorkspaceService(
    new SftpProfileStore(join(app.getPath('userData'), 'codezera', 'sftp-profiles.json')),
    () => store.getSshTargets()
  )
  const watchers = createConfigWatchers(service)
  app.once('will-quit', () => {
    watchers.closeAll()
    service.dispose()
  })

  ipcMain.handle(
    'codezera:sftp:getState',
    (_event, args: SftpWorkspaceRequest): Promise<SftpConfigState> => {
      const workspacePath = requireAbsolute(args.workspacePath, 'workspacePath')
      watchers.ensure(workspacePath)
      return service.getState(workspacePath)
    }
  )
  ipcMain.handle(
    'codezera:sftp:setProfile',
    (_event, args: SftpWorkspaceRequest & { profile: string }): Promise<SftpConfigState> =>
      service.setProfile(requireAbsolute(args.workspacePath, 'workspacePath'), String(args.profile))
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
