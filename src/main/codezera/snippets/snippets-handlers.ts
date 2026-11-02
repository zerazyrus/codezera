import { app, BrowserWindow, ipcMain } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SaveCodezeraSnippetArgs } from '../../../shared/codezera/snippets-types'
import { CodezeraSnippetStore } from './snippet-store'

const CHANGED_CHANNEL = 'codezera:snippets:changed'

/** Import source only; Codezera never reads VS Code's snippets at runtime. */
export function vscodeUserSnippetsDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'snippets')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    return join(appData, 'Code', 'User', 'snippets')
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(configHome, 'Code', 'User', 'snippets')
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`${field} is required`)
  }
  return value
}

export function registerCodezeraSnippetsHandlers(): void {
  const store = new CodezeraSnippetStore(join(app.getPath('userData'), 'codezera', 'snippets'))
  const changed = <T>(result: T): T => {
    // Completion caches refetch right away instead of waiting out their refresh window.
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(CHANGED_CHANNEL)
    }
    return result
  }

  ipcMain.handle('codezera:snippets:list', () => store.listSnippets())
  ipcMain.handle('codezera:snippets:listEntries', () => store.listEntries())
  ipcMain.handle('codezera:snippets:save', async (_event, args: SaveCodezeraSnippetArgs) =>
    changed(await store.save(args))
  )
  ipcMain.handle(
    'codezera:snippets:delete',
    async (_event, args: { file: unknown; name: unknown }) =>
      changed(
        await store.delete({
          file: requireString(args?.file, 'file'),
          name: requireString(args?.name, 'name')
        })
      )
  )
  ipcMain.handle('codezera:snippets:importFromVscode', async () =>
    changed(await store.importFrom(vscodeUserSnippetsDir()))
  )
}
