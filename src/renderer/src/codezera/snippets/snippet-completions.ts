import type * as Monaco from 'monaco-editor'
import type { CodezeraSnippet } from '../../../../shared/codezera/snippets-types'
import { snippetAppliesTo, snippetReplaceStartColumn } from './snippet-scope-match'

type MonacoApi = typeof Monaco
type SnippetSource = {
  list: () => Promise<CodezeraSnippet[]>
  onChanged: (callback: () => void) => () => void
}

// Editor tabs only; prompt boxes and diff/inmemory models would otherwise get global snippets.
const SNIPPET_SCHEMES: Record<string, true> = { file: true, 'vscode-remote': true }
// Settings edits invalidate immediately; this window only bounds IPC and picks up hand edits.
const REFRESH_AFTER_MS = 2000

const registered = new WeakSet<MonacoApi>()

function createSnippetCache(source: SnippetSource): () => Promise<CodezeraSnippet[]> {
  let cached: { fetchedAt: number; snippets: Promise<CodezeraSnippet[]> } | null = null
  source.onChanged(() => {
    cached = null
  })
  return () => {
    const now = Date.now()
    if (!cached || now - cached.fetchedAt >= REFRESH_AFTER_MS) {
      cached = { fetchedAt: now, snippets: source.list().catch(() => []) }
    }
    return cached.snippets
  }
}

export function registerCodezeraSnippetCompletions(
  monaco: MonacoApi,
  source: SnippetSource = window.api.codezera.snippets
): Monaco.IDisposable | undefined {
  if (registered.has(monaco)) {
    return undefined
  }
  registered.add(monaco)
  const loadSnippets = createSnippetCache(source)
  return monaco.languages.registerCompletionItemProvider('*', {
    async provideCompletionItems(model, position) {
      if (!SNIPPET_SCHEMES[model.uri.scheme]) {
        return undefined
      }
      const snippets = await loadSnippets()
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
