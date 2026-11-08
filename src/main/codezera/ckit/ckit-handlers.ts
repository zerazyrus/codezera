import { ipcMain } from 'electron'
import { getCkitQuota } from './ckit-quota'
import { saveCkitApiKey } from './ckit-setup'
import { checkCkitToolUpdates, runCkitToolUpdates } from './ckit-tool-updates'

export function registerCodezeraCkitHandlers(): void {
  ipcMain.handle('codezera:ckit:getQuota', () => getCkitQuota())
  ipcMain.handle('codezera:ckit:saveApiKey', async (_event, apiKey: unknown, options: unknown) => {
    await saveCkitApiKey(apiKey, options)
    return getCkitQuota()
  })
  ipcMain.handle('codezera:ckit:checkToolUpdates', () => checkCkitToolUpdates())
  ipcMain.handle('codezera:ckit:runToolUpdates', (_event, tools: unknown) =>
    runCkitToolUpdates(tools)
  )
}
