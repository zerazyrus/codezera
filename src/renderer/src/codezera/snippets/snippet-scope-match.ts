import { match as matchGlob } from 'monaco-editor/esm/vs/base/common/glob.js'
import type { CodezeraSnippet } from '../../../../shared/codezera/snippets-types'

function globMatchesPath(pattern: string, path: string): boolean {
  // Separator-free patterns such as `*.tpl` describe a file name, not a full path.
  const target = pattern.includes('/') ? path : path.slice(path.lastIndexOf('/') + 1)
  return matchGlob(pattern, target)
}

/**
 * `include` widens `scope` because Orca has no language for files like `.tpl` (plaintext), so a
 * VS Code `smarty` scope alone would never match; `exclude` always wins.
 */
export function snippetAppliesTo(
  snippet: CodezeraSnippet,
  languageId: string,
  path: string
): boolean {
  if (snippet.exclude.some((pattern) => globMatchesPath(pattern, path))) {
    return false
  }
  const included = snippet.include.some((pattern) => globMatchesPath(pattern, path))
  if (snippet.scopes.length === 0) {
    return snippet.include.length === 0 || included
  }
  return included || snippet.scopes.includes(languageId)
}

/** Start the replace range where the typed text begins a prefix with non-word chars (e.g. `@da` for `@date`). */
export function snippetReplaceStartColumn(
  linePrefix: string,
  prefix: string,
  wordStartColumn: number
): number {
  const lowerLine = linePrefix.toLowerCase()
  const lowerPrefix = prefix.toLowerCase()
  for (
    let start = Math.max(0, linePrefix.length - prefix.length);
    start < wordStartColumn - 1;
    start++
  ) {
    if (lowerPrefix.startsWith(lowerLine.slice(start))) {
      return start + 1
    }
  }
  return wordStartColumn
}
