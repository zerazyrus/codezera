import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { OrcaImportProbe, OrcaImportResult } from '../../../shared/codezera/orca-import-types'
import { getOrcaUserDataPath, probeOrcaProfile, stageOrcaImport } from './orca-profile-import'

function probe(): OrcaImportProbe {
  const userData = app.getPath('userData')
  return probeOrcaProfile(getOrcaUserDataPath(userData), userData)
}

export function registerCodezeraOrcaImportHandlers(): void {
  ipcMain.handle('codezera:orcaImport:probe', (): OrcaImportProbe => probe())

  ipcMain.handle('codezera:orcaImport:run', async (event): Promise<OrcaImportResult> => {
    const found = probe()
    if (!found.available) {
      throw new Error('No Orca data found on this computer.')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'question' as const,
      buttons: ['Import and restart', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Import projects and settings from Orca?',
      detail:
        `Copies ${found.projectCount} project(s), workspaces, settings and SSH targets from ` +
        `${found.sourcePath}. Codezera's current projects and settings are replaced and kept in ` +
        'a backup folder. Terminal sessions, automations and the Orca account sign-in are not ' +
        'copied. Orca itself is not changed.'
    }
    const { response } = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options)
    if (response !== 0) {
      return { status: 'cancelled' }
    }
    stageOrcaImport(found.sourcePath, app.getPath('userData'))
    // Live profile files belong to this process; the next launch swaps them before opening any.
    app.relaunch()
    app.quit()
    return { status: 'relaunching' }
  })
}
