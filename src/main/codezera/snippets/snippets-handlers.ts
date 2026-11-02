import { ipcMain } from 'electron'
import { listVscodeSnippets } from './vscode-snippet-store'

export function registerCodezeraSnippetsHandlers(): void {
  ipcMain.handle('codezera:snippets:list', (_event, filePath: unknown) =>
    listVscodeSnippets(typeof filePath === 'string' ? filePath : '')
  )
}
