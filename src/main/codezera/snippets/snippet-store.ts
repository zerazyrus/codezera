import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  CODEZERA_MANAGED_SNIPPET_FILE,
  type CodezeraSnippet,
  type CodezeraSnippetEntry,
  type CodezeraSnippetImportResult,
  type SaveCodezeraSnippetArgs
} from '../../../shared/codezera/snippets-types'
import {
  parseSnippetEntries,
  removeSnippetText,
  scopeLanguageSnippetText,
  toCompletionSnippet,
  upsertSnippetText
} from './snippet-file-format'

const SNIPPET_EXTENSION = '.code-snippets'

type CachedFile = {
  mtimeMs: number
  size: number
  entries: CodezeraSnippetEntry[]
  snippets: CodezeraSnippet[]
}

function requireSnippetFileName(file: string): string {
  if (basename(file) !== file || !file.endsWith(SNIPPET_EXTENSION)) {
    throw new Error(`Invalid snippet file name: ${file}`)
  }
  return file
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/** Codezera's own snippet folder: `*.code-snippets` files in VS Code's format, read only from here. */
export class CodezeraSnippetStore {
  // A stat per request keeps hand edits live without re-parsing unchanged files.
  private readonly fileCache = new Map<string, CachedFile>()
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(readonly dir: string) {}

  async listSnippets(): Promise<CodezeraSnippet[]> {
    return (await this.readAll()).flatMap((file) => file.snippets)
  }

  async listEntries(): Promise<CodezeraSnippetEntry[]> {
    return (await this.readAll()).flatMap((file) => file.entries)
  }

  save({ file, originalName, snippet }: SaveCodezeraSnippetArgs): Promise<void> {
    const target = requireSnippetFileName(file ?? CODEZERA_MANAGED_SNIPPET_FILE)
    return this.serialize(async () => {
      const text = (await readTextOrNull(join(this.dir, target))) ?? '{}'
      await this.writeAtomic(target, upsertSnippetText(text, target, originalName, snippet))
    })
  }

  delete({ file, name }: { file: string; name: string }): Promise<void> {
    const target = requireSnippetFileName(file)
    return this.serialize(async () => {
      const text = await readTextOrNull(join(this.dir, target))
      if (text === null) {
        throw new Error(`Snippet file not found: ${target}`)
      }
      await this.writeAtomic(target, removeSnippetText(text, target, name))
    })
  }

  /**
   * Copies `*.code-snippets` and `<languageId>.json` files from `sourceDir`. A name clash with
   * different content keeps both by suffixing the copy (`name-2.code-snippets`); identical
   * content is skipped, so importing twice adds nothing.
   */
  importFrom(sourceDir: string): Promise<CodezeraSnippetImportResult> {
    return this.serialize(async () => {
      const result: CodezeraSnippetImportResult = {
        sourceDir,
        sourceFound: true,
        importedSnippets: 0,
        importedFiles: [],
        unchangedFiles: []
      }
      let names: string[]
      try {
        names = (await readdir(sourceDir)).sort()
      } catch {
        return { ...result, sourceFound: false }
      }
      for (const name of names) {
        let stem: string
        let text: string
        if (name.endsWith(SNIPPET_EXTENSION)) {
          stem = name.slice(0, -SNIPPET_EXTENSION.length)
          text = await readFile(join(sourceDir, name), 'utf8')
        } else if (name.endsWith('.json')) {
          stem = name.slice(0, -'.json'.length)
          text = scopeLanguageSnippetText(await readFile(join(sourceDir, name), 'utf8'), stem)
        } else {
          continue
        }
        const target = await this.importTargetFor(stem, text)
        if (target === null) {
          result.unchangedFiles.push(name)
          continue
        }
        await this.writeAtomic(target, text)
        result.importedFiles.push(target)
        result.importedSnippets += parseSnippetEntries(text, target).length
      }
      return result
    })
  }

  /** First free `<stem>[-n].code-snippets`, or null when one of them already holds `text`. */
  private async importTargetFor(stem: string, text: string): Promise<string | null> {
    for (let index = 1; ; index++) {
      const candidate = `${index === 1 ? stem : `${stem}-${index}`}${SNIPPET_EXTENSION}`
      const existing = await readTextOrNull(join(this.dir, candidate))
      if (existing === null) {
        return candidate
      }
      if (existing === text) {
        return null
      }
    }
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeChain.catch(() => {}).then(task)
    this.writeChain = run
    return run
  }

  private async writeAtomic(file: string, text: string): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const path = join(this.dir, file)
    const temp = `${path}.tmp`
    await writeFile(temp, text, 'utf8')
    await rename(temp, path)
    this.fileCache.delete(path)
  }

  private async readAll(): Promise<CachedFile[]> {
    let names: string[]
    try {
      names = (await readdir(this.dir)).filter((name) => name.endsWith(SNIPPET_EXTENSION)).sort()
    } catch {
      return []
    }
    const files = await Promise.all(names.map((name) => this.readCached(name)))
    return files.filter((file): file is CachedFile => file !== null)
  }

  private async readCached(file: string): Promise<CachedFile | null> {
    const path = join(this.dir, file)
    try {
      const info = await stat(path)
      const cached = this.fileCache.get(path)
      if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
        return cached
      }
      const entries = parseSnippetEntries(await readFile(path, 'utf8'), file)
      const next = {
        mtimeMs: info.mtimeMs,
        size: info.size,
        entries,
        snippets: entries.map(toCompletionSnippet)
      }
      this.fileCache.set(path, next)
      return next
    } catch {
      this.fileCache.delete(path)
      return null
    }
  }
}
