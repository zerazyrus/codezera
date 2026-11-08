import { ipcRenderer } from 'electron'
import type { GitGraphApi } from '../../shared/codezera/git-graph-types'
import type { OrcaImportApi } from '../../shared/codezera/orca-import-types'
import type { CkitApi } from '../../shared/codezera/ckit-types'
import type { SnippetsApi } from '../../shared/codezera/snippets-types'
import type { SftpApi } from '../../shared/codezera/sftp-types'
import type { PmsApi } from '../../shared/codezera/pms-types'

export type CodezeraApi = {
  gitGraph: GitGraphApi
  orcaImport: OrcaImportApi
  ckit: CkitApi
  snippets: SnippetsApi
  sftp: SftpApi
  pms: PmsApi
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
    saveApiKey: (apiKey, options) =>
      ipcRenderer.invoke('codezera:ckit:saveApiKey', apiKey, options),
    checkToolUpdates: () => ipcRenderer.invoke('codezera:ckit:checkToolUpdates'),
    runToolUpdates: (tools) => ipcRenderer.invoke('codezera:ckit:runToolUpdates', tools)
  },
  snippets: {
    list: () => ipcRenderer.invoke('codezera:snippets:list'),
    listEntries: () => ipcRenderer.invoke('codezera:snippets:listEntries'),
    save: (args) => ipcRenderer.invoke('codezera:snippets:save', args),
    delete: (args) => ipcRenderer.invoke('codezera:snippets:delete', args),
    importFromVscode: () => ipcRenderer.invoke('codezera:snippets:importFromVscode'),
    onChanged: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on('codezera:snippets:changed', listener)
      return () => ipcRenderer.removeListener('codezera:snippets:changed', listener)
    }
  },
  sftp: {
    getState: (args) => ipcRenderer.invoke('codezera:sftp:getState', args),
    setProfile: (args) => ipcRenderer.invoke('codezera:sftp:setProfile', args),
    saveProfile: (args) => ipcRenderer.invoke('codezera:sftp:saveProfile', args),
    deleteProfile: (args) => ipcRenderer.invoke('codezera:sftp:deleteProfile', args),
    importFromVsCode: (args) => ipcRenderer.invoke('codezera:sftp:importFromVsCode', args),
    importAllFromVsCode: () => ipcRenderer.invoke('codezera:sftp:importAllFromVsCode'),
    list: (args) => ipcRenderer.invoke('codezera:sftp:list', args),
    downloadRemote: (args) => ipcRenderer.invoke('codezera:sftp:downloadRemote', args),
    downloadLocal: (args) => ipcRenderer.invoke('codezera:sftp:downloadLocal', args),
    upload: (args) => ipcRenderer.invoke('codezera:sftp:upload', args),
    uploadOnSave: (args) => ipcRenderer.invoke('codezera:sftp:uploadOnSave', args),
    readRemoteFile: (args) => ipcRenderer.invoke('codezera:sftp:readRemoteFile', args),
    sshCommand: (args) => ipcRenderer.invoke('codezera:sftp:sshCommand', args),
    setSudoPassword: (args) => ipcRenderer.invoke('codezera:sftp:setSudoPassword', args),
    disconnect: (args) => ipcRenderer.invoke('codezera:sftp:disconnect', args),
    onConfigChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, workspacePath: string): void =>
        callback(workspacePath)
      ipcRenderer.on('codezera:sftp:configChanged', listener)
      return () => ipcRenderer.removeListener('codezera:sftp:configChanged', listener)
    }
  },
  pms: {
    getStatus: () => ipcRenderer.invoke('codezera:pms:getStatus'),
    connect: (input) => ipcRenderer.invoke('codezera:pms:connect', input),
    connectFromSkillConfig: () => ipcRenderer.invoke('codezera:pms:connectFromSkillConfig'),
    disconnect: () => ipcRenderer.invoke('codezera:pms:disconnect'),
    list: (args) => ipcRenderer.invoke('codezera:pms:list', args),
    queue: (args) => ipcRenderer.invoke('codezera:pms:queue', args),
    getItem: (args) => ipcRenderer.invoke('codezera:pms:getItem', args),
    statusOptions: (kind) => ipcRenderer.invoke('codezera:pms:statusOptions', kind),
    logTimeCategories: () => ipcRenderer.invoke('codezera:pms:logTimeCategories'),
    setStatus: (args) => ipcRenderer.invoke('codezera:pms:setStatus', args),
    saveTicket: (args) => ipcRenderer.invoke('codezera:pms:saveTicket', args),
    takeTicket: (args) => ipcRenderer.invoke('codezera:pms:takeTicket', args),
    finishTicket: (args) => ipcRenderer.invoke('codezera:pms:finishTicket', args),
    ticketTasks: (ticketId) => ipcRenderer.invoke('codezera:pms:ticketTasks', ticketId),
    createTicketTask: (args) => ipcRenderer.invoke('codezera:pms:createTicketTask', args),
    users: () => ipcRenderer.invoke('codezera:pms:users'),
    ticketFieldOptions: (field) => ipcRenderer.invoke('codezera:pms:ticketFieldOptions', field),
    logTime: (args) => ipcRenderer.invoke('codezera:pms:logTime', args),
    loggedHours: (date) => ipcRenderer.invoke('codezera:pms:loggedHours', date),
    reportPreview: (args) => ipcRenderer.invoke('codezera:pms:reportPreview', args),
    submitReport: (args) => ipcRenderer.invoke('codezera:pms:submitReport', args),
    writeReport: (args) => ipcRenderer.invoke('codezera:pms:writeReport', args),
    cancelWriteReport: () => ipcRenderer.invoke('codezera:pms:cancelWriteReport')
  }
}
