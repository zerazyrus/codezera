import { ipcRenderer } from 'electron'
import type { GitGraphApi } from '../../shared/codezera/git-graph-types'
import type { OrcaImportApi } from '../../shared/codezera/orca-import-types'
import type { CkitApi } from '../../shared/codezera/ckit-types'
import type { SnippetsApi } from '../../shared/codezera/snippets-types'
import type { SftpApi } from '../../shared/codezera/sftp-types'

export type CodezeraApi = {
  gitGraph: GitGraphApi
  orcaImport: OrcaImportApi
  ckit: CkitApi
  snippets: SnippetsApi
  sftp: SftpApi
}

export const codezeraApi: CodezeraApi = {
  gitGraph: {
    log: (args) => ipcRenderer.invoke('codezera:gitGraph:log', args),
    runAction: (args) => ipcRenderer.invoke('codezera:gitGraph:action', args),
    repoInfo: (args) => ipcRenderer.invoke('codezera:gitGraph:repoInfo', args),
    getSettings: (repoId) => ipcRenderer.invoke('codezera:gitGraph:getSettings', repoId),
    setSettings: (repoId, settings) =>
      ipcRenderer.invoke('codezera:gitGraph:setSettings', repoId, settings)
  },
  orcaImport: {
    probe: () => ipcRenderer.invoke('codezera:orcaImport:probe'),
    run: () => ipcRenderer.invoke('codezera:orcaImport:run')
  },
  ckit: {
    getQuota: () => ipcRenderer.invoke('codezera:ckit:getQuota'),
    saveApiKey: (apiKey) => ipcRenderer.invoke('codezera:ckit:saveApiKey', apiKey)
  },
  snippets: {
    list: (filePath) => ipcRenderer.invoke('codezera:snippets:list', filePath)
  },
  sftp: {
    getState: (args) => ipcRenderer.invoke('codezera:sftp:getState', args),
    setProfile: (args) => ipcRenderer.invoke('codezera:sftp:setProfile', args),
    list: (args) => ipcRenderer.invoke('codezera:sftp:list', args),
    downloadRemote: (args) => ipcRenderer.invoke('codezera:sftp:downloadRemote', args),
    downloadLocal: (args) => ipcRenderer.invoke('codezera:sftp:downloadLocal', args),
    upload: (args) => ipcRenderer.invoke('codezera:sftp:upload', args),
    uploadOnSave: (args) => ipcRenderer.invoke('codezera:sftp:uploadOnSave', args),
    readRemoteFile: (args) => ipcRenderer.invoke('codezera:sftp:readRemoteFile', args),
    sshCommand: (args) => ipcRenderer.invoke('codezera:sftp:sshCommand', args),
    disconnect: (args) => ipcRenderer.invoke('codezera:sftp:disconnect', args),
    onConfigChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, workspacePath: string): void =>
        callback(workspacePath)
      ipcRenderer.on('codezera:sftp:configChanged', listener)
      return () => ipcRenderer.removeListener('codezera:sftp:configChanged', listener)
    }
  }
}
