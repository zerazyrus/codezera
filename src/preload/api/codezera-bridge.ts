import { ipcRenderer } from 'electron'
import type { GitGraphApi } from '../../shared/codezera/git-graph-types'
import type { OrcaImportApi } from '../../shared/codezera/orca-import-types'
import type { CkitApi } from '../../shared/codezera/ckit-types'

export type CodezeraApi = {
  gitGraph: GitGraphApi
  orcaImport: OrcaImportApi
  ckit: CkitApi
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
  }
}
