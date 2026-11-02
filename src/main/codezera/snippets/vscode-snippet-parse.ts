import { parse as parseJsonc, type ParseError } from 'jsonc-parser'
import type { CodezeraSnippet } from '../../../shared/codezera/snippets-types'

// VS Code ids that Orca's Monaco folds into another language id.
const VSCODE_TO_MONACO_LANGUAGE: Record<string, string> = {
  typescriptreact: 'typescript',
  javascriptreact: 'javascript',
  shellscript: 'shell',
  jsonc: 'json',
  dockercompose: 'yaml'
}

export function toMonacoLanguageId(vscodeLanguageId: string): string {
  return VSCODE_TO_MONACO_LANGUAGE[vscodeLanguageId] ?? vscodeLanguageId
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value ? [value] : []
  }
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
}

function snippetBody(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }
  // Empty strings inside a body array are blank lines, so keep them.
  return Array.isArray(value) && value.every((line) => typeof line === 'string')
    ? value.join('\n')
    : null
}

/**
 * Parse one VS Code snippet file. `languageId` is set for `<languageId>.json` files, whose
 * snippets ignore `scope`; `.code-snippets` files pass null and scope each snippet itself.
 */
export function parseVscodeSnippetFile(
  text: string,
  source: string,
  languageId: string | null
): CodezeraSnippet[] {
  const errors: ParseError[] = []
  const root: unknown = parseJsonc(text, errors, { allowTrailingComma: true })
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    return []
  }
  const snippets: CodezeraSnippet[] = []
  for (const [name, raw] of Object.entries(root as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const entry = raw as Record<string, unknown>
    const prefixes = stringList(entry.prefix)
    const body = snippetBody(entry.body)
    // Prefix-less snippets are only reachable from VS Code's Insert Snippet picker.
    if (prefixes.length === 0 || body === null) {
      continue
    }
    const scopes = languageId
      ? [toMonacoLanguageId(languageId)]
      : typeof entry.scope === 'string'
        ? entry.scope
            .split(',')
            .map((scope) => scope.trim())
            .filter(Boolean)
            .map(toMonacoLanguageId)
        : []
    snippets.push({
      name,
      prefixes,
      body,
      description: typeof entry.description === 'string' ? entry.description : '',
      scopes: [...new Set(scopes)],
      include: stringList(entry.include),
      exclude: stringList(entry.exclude),
      source
    })
  }
  return snippets
}
