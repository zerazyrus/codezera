import { ipcRenderer } from 'electron'
import type { GitGraphApi } from '../../shared/codezera/git-graph-types'

export type CodezeraApi = {
  gitGraph: GitGraphApi
}

export const codezeraApi: CodezeraApi = {
  gitGraph: {
    log: (args) => ipcRenderer.invoke('codezera:gitGraph:log', args),
    runAction: (args) => ipcRenderer.invoke('codezera:gitGraph:action', args),
    repoInfo: (args) => ipcRenderer.invoke('codezera:gitGraph:repoInfo', args),
    getSettings: (repoId) => ipcRenderer.invoke('codezera:gitGraph:getSettings', repoId),
    setSettings: (repoId, settings) =>
      ipcRenderer.invoke('codezera:gitGraph:setSettings', repoId, settings)
  }
}
