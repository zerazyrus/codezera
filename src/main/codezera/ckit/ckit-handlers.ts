import { ipcMain } from 'electron'
import { getCkitQuota } from './ckit-quota'
import { saveCkitApiKey } from './ckit-setup'

export function registerCodezeraCkitHandlers(): void {
  ipcMain.handle('codezera:ckit:getQuota', () => getCkitQuota())
  ipcMain.handle('codezera:ckit:saveApiKey', async (_event, apiKey: unknown) => {
    await saveCkitApiKey(apiKey)
    return getCkitQuota()
  })
}
