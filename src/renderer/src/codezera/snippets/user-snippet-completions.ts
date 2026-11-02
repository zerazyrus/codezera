import type * as Monaco from 'monaco-editor'
import type { CodezeraSnippet } from '../../../../shared/codezera/snippets-types'
import { snippetAppliesTo, snippetReplaceStartColumn } from './snippet-scope-match'

type MonacoApi = typeof Monaco
type ListSnippets = (filePath: string) => Promise<CodezeraSnippet[]>

// Editor tabs only; prompt boxes and diff/inmemory models would otherwise get global snippets.
const SNIPPET_SCHEMES: Record<string, true> = { file: true, 'vscode-remote': true }
// Suggest sessions re-query rarely, so this bounds IPC while keeping VS Code edits near-live.
const REFRESH_AFTER_MS = 2000
const MAX_CACHED_DIRS = 64

type CacheEntry = { fetchedAt: number; snippets: Promise<CodezeraSnippet[]> }

const registered = new WeakSet<MonacoApi>()

function createSnippetCache(
  listSnippets: ListSnippets
): (filePath: string) => Promise<CodezeraSnippet[]> {
  const byDir = new Map<string, CacheEntry>()
  return (filePath) => {
    // Workspace snippets depend only on the folder, so siblings share one fetch.
    const dir = filePath.slice(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')))
    const now = Date.now()
    const cached = byDir.get(dir)
    if (cached && now - cached.fetchedAt < REFRESH_AFTER_MS) {
      return cached.snippets
    }
    const snippets = listSnippets(filePath).catch(() => [])
    byDir.delete(dir)
    if (byDir.size >= MAX_CACHED_DIRS) {
      byDir.delete(byDir.keys().next().value as string)
    }
    byDir.set(dir, { fetchedAt: now, snippets })
    return snippets
  }
}

export function registerCodezeraUserSnippets(
  monaco: MonacoApi,
  listSnippets: ListSnippets = (filePath) => window.api.codezera.snippets.list(filePath)
): Monaco.IDisposable | undefined {
  if (registered.has(monaco)) {
    return undefined
  }
  registered.add(monaco)
  const loadSnippets = createSnippetCache(listSnippets)
  return monaco.languages.registerCompletionItemProvider('*', {
    async provideCompletionItems(model, position) {
      if (!SNIPPET_SCHEMES[model.uri.scheme]) {
        return undefined
      }
      const snippets = await loadSnippets(model.uri.fsPath)
      if (snippets.length === 0 || model.isDisposed()) {
        return undefined
      }
      const languageId = model.getLanguageId()
      const path = model.uri.path
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      const wordStartColumn = model.getWordUntilPosition(position).startColumn
      const suggestions: Monaco.languages.CompletionItem[] = []
      for (const snippet of snippets) {
        if (!snippetAppliesTo(snippet, languageId, path)) {
          continue
        }
        for (const prefix of snippet.prefixes) {
          suggestions.push({
            label: { label: prefix, description: snippet.name },
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snippet.description || snippet.name,
            documentation: {
              value: `\`\`\`${languageId}\n${snippet.body}\n\`\`\`\n\n${snippet.source}`
            },
            insertText: snippet.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: snippetReplaceStartColumn(linePrefix, prefix, wordStartColumn),
              endLineNumber: position.lineNumber,
              endColumn: position.column
            }
          })
        }
      }
      return { suggestions }
    }
  })
}
