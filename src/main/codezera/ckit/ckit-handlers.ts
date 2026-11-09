import { ipcMain } from 'electron'
import { getCkitQuota } from './ckit-quota'
import { applyCkitTeamSettings, saveCkitApiKey } from './ckit-setup'
import { checkCkitToolUpdates, runCkitToolUpdates } from './ckit-tool-updates'

export function registerCodezeraCkitHandlers(): void {
  // Each Codezera release re-applies the team settings, so changes reach existing installs.
  void applyCkitTeamSettings().catch((error: unknown) => {
    console.warn('[codezera] could not apply ckit team settings', error)
  })
  ipcMain.handle('codezera:ckit:getQuota', () => getCkitQuota())
  ipcMain.handle('codezera:ckit:saveApiKey', async (_event, apiKey: unknown, options: unknown) => {
    await saveCkitApiKey(apiKey, options)
    return getCkitQuota()
  })
  ipcMain.handle('codezera:ckit:checkToolUpdates', () => checkCkitToolUpdates())
  ipcMain.handle('codezera:ckit:runToolUpdates', async (_event, tools: unknown) => {
    const result = await runCkitToolUpdates(tools)
    // A newer ckit may now honour settings an older one could not write.
    if (result.ok) {
      await applyCkitTeamSettings().catch((error: unknown) => {
        console.warn('[codezera] could not apply ckit team settings', error)
      })
    }
    return result
  })
}
