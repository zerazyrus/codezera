import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import type { CodezeraSnippet } from '../../../shared/codezera/snippets-types'
import { parseVscodeSnippetFile } from './vscode-snippet-parse'

type CachedFile = { mtimeMs: number; size: number; snippets: CodezeraSnippet[] }

// Keyed by absolute path; a stat per request keeps VS Code edits live without re-parsing.
const fileCache = new Map<string, CachedFile>()

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

async function readSnippetFile(
  path: string,
  languageId: string | null
): Promise<CodezeraSnippet[]> {
  try {
    const info = await stat(path)
    const cached = fileCache.get(path)
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return cached.snippets
    }
    const snippets = parseVscodeSnippetFile(
      await readFile(path, 'utf8'),
      basename(path),
      languageId
    )
    fileCache.set(path, { mtimeMs: info.mtimeMs, size: info.size, snippets })
    return snippets
  } catch {
    fileCache.delete(path)
    return []
  }
}

async function readSnippetDir(dir: string, languageFiles: boolean): Promise<CodezeraSnippet[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const lists = await Promise.all(
    names.map((name) => {
      if (name.endsWith('.code-snippets')) {
        return readSnippetFile(join(dir, name), null)
      }
      if (languageFiles && name.endsWith('.json')) {
        return readSnippetFile(join(dir, name), name.slice(0, -'.json'.length))
      }
      return []
    })
  )
  return lists.flat()
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Nearest ancestor `.vscode` dir, stopping at the repo root; `~/.vscode` holds extensions, not snippets. */
async function findWorkspaceVscodeDir(filePath: string): Promise<string | null> {
  const home = homedir()
  let dir = dirname(filePath)
  while (dir !== home) {
    if (await pathExists(join(dir, '.vscode'))) {
      return join(dir, '.vscode')
    }
    const parent = dirname(dir)
    if (parent === dir || (await pathExists(join(dir, '.git')))) {
      return null
    }
    dir = parent
  }
  return null
}

export async function listVscodeSnippets(filePath: string): Promise<CodezeraSnippet[]> {
  const workspaceDir = isAbsolute(filePath) ? await findWorkspaceVscodeDir(filePath) : null
  const [user, workspace] = await Promise.all([
    readSnippetDir(vscodeUserSnippetsDir(), true),
    workspaceDir ? readSnippetDir(workspaceDir, false) : []
  ])
  return [...user, ...workspace]
}
