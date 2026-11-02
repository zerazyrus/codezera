import {
  applyEdits,
  modify,
  parse as parseJsonc,
  parseTree,
  type FormattingOptions,
  type Node as JsonNode,
  type ParseError
} from 'jsonc-parser'
import type {
  CodezeraSnippet,
  CodezeraSnippetDraft,
  CodezeraSnippetEntry
} from '../../../shared/codezera/snippets-types'

// VS Code ids that Orca's Monaco folds into another language id.
const VSCODE_TO_MONACO_LANGUAGE: Record<string, string> = {
  typescriptreact: 'typescript',
  javascriptreact: 'javascript',
  shellscript: 'shell',
  jsonc: 'json',
  dockercompose: 'yaml'
}

// Matches VS Code's own snippet files, so imported files keep one indentation style.
const FORMATTING: FormattingOptions = { tabSize: 4, insertSpaces: false, eol: '\n' }

function stringList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value ? [value] : []
  }
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
}

function bodyLines(value: unknown): string[] | null {
  if (typeof value === 'string') {
    return value.split('\n')
  }
  // Empty strings inside a body array are blank lines, so keep them.
  return Array.isArray(value) && value.every((line) => typeof line === 'string') ? value : null
}

function parseRoot(text: string): Record<string, unknown> | null {
  const errors: ParseError[] = []
  const root: unknown = parseJsonc(text, errors, { allowTrailingComma: true })
  return root && typeof root === 'object' && !Array.isArray(root)
    ? (root as Record<string, unknown>)
    : null
}

function requireRoot(text: string, file: string): Record<string, unknown> {
  const root = parseRoot(text)
  if (!root) {
    throw new Error(`${file} is not a snippet file (expected a JSON object)`)
  }
  return root
}

/** Snippets of one `.code-snippets` file; prefix-less ones are skipped since nothing can trigger them. */
export function parseSnippetEntries(text: string, file: string): CodezeraSnippetEntry[] {
  const entries: CodezeraSnippetEntry[] = []
  for (const [name, raw] of Object.entries(parseRoot(text) ?? {})) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const entry = raw as Record<string, unknown>
    const prefixes = stringList(entry.prefix)
    const body = bodyLines(entry.body)
    if (prefixes.length === 0 || body === null) {
      continue
    }
    entries.push({
      file,
      name,
      prefixes,
      languages:
        typeof entry.scope === 'string'
          ? entry.scope
              .split(',')
              .map((scope) => scope.trim())
              .filter(Boolean)
          : [],
      include: stringList(entry.include),
      exclude: stringList(entry.exclude),
      description: typeof entry.description === 'string' ? entry.description : '',
      body
    })
  }
  return entries
}

export function toCompletionSnippet(entry: CodezeraSnippetEntry): CodezeraSnippet {
  return {
    name: entry.name,
    prefixes: entry.prefixes,
    body: entry.body.join('\n'),
    description: entry.description,
    scopes: [...new Set(entry.languages.map((id) => VSCODE_TO_MONACO_LANGUAGE[id] ?? id))],
    include: entry.include,
    exclude: entry.exclude,
    source: entry.file
  }
}

/**
 * Writes `draft` into the file text through JSONC edits, so comments, other snippets and
 * fields Settings does not edit (e.g. `isFileTemplate`) survive.
 */
export function upsertSnippetText(
  text: string,
  file: string,
  originalName: string | null,
  draft: CodezeraSnippetDraft
): string {
  if (!draft.name.trim() || draft.prefixes.length === 0 || draft.body.join('').trim() === '') {
    throw new Error('A snippet needs a name, a prefix and a body')
  }
  const root = requireRoot(text, file)
  if (draft.name !== originalName && Object.hasOwn(root, draft.name)) {
    throw new Error(`A snippet named "${draft.name}" already exists in ${file}`)
  }
  const previous = originalName === null ? undefined : root[originalName]
  const value: Record<string, unknown> = {
    ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}),
    prefix: draft.prefixes.length === 1 ? draft.prefixes[0] : draft.prefixes,
    body: draft.body
  }
  const optional: [string, unknown, boolean][] = [
    ['scope', draft.languages.join(','), draft.languages.length > 0],
    ['include', draft.include, draft.include.length > 0],
    ['exclude', draft.exclude, draft.exclude.length > 0],
    ['description', draft.description, draft.description.length > 0]
  ]
  for (const [key, fieldValue, present] of optional) {
    if (present) {
      value[key] = fieldValue
    } else {
      delete value[key]
    }
  }
  let next = text
  if (originalName !== null && originalName !== draft.name) {
    // Rewrite only the key so the snippet keeps its place and surrounding comments.
    const key = findProperty(next, originalName)?.children?.[0]
    if (key) {
      next = `${next.slice(0, key.offset)}${JSON.stringify(draft.name)}${next.slice(key.offset + key.length)}`
    }
  }
  return applyEdits(next, modify(next, [draft.name], value, { formattingOptions: FORMATTING }))
}

export function removeSnippetText(text: string, file: string, name: string): string {
  if (!Object.hasOwn(requireRoot(text, file), name)) {
    throw new Error(`No snippet named "${name}" in ${file}`)
  }
  return removeProperty(text, name)
}

function findProperty(text: string, name: string): JsonNode | undefined {
  return parseTree(text, [], { allowTrailingComma: true })?.children?.find(
    (property) => property.children?.[0]?.value === name
  )
}

/**
 * jsonc-parser's own removal of the first property also deletes the comments above it (VS Code's
 * header), so cut just the property, its comma and its line.
 */
function removeProperty(text: string, name: string): string {
  const property = findProperty(text, name)
  if (!property) {
    return text
  }
  let start = property.offset
  let end = property.offset + property.length
  const commaAfter = /^\s*,[ \t]*/.exec(text.slice(end))
  if (commaAfter) {
    end += commaAfter[0].length
    const lineStart = text.lastIndexOf('\n', start - 1) + 1
    const lineBreak = /^\r?\n/.exec(text.slice(end))
    if (lineBreak && /^[ \t]*$/.test(text.slice(lineStart, start))) {
      start = lineStart
      end += lineBreak[0].length
    }
  } else {
    // Last property: drop the comma before it instead; a comment in between leaves a trailing comma, which JSONC allows.
    const commaBefore = /,\s*$/.exec(text.slice(0, start))
    if (commaBefore) {
      start -= commaBefore[0].length
    }
  }
  return text.slice(0, start) + text.slice(end)
}

/** Turns a VS Code `<languageId>.json` file into `.code-snippets` text by scoping every snippet to that language. */
export function scopeLanguageSnippetText(text: string, languageId: string): string {
  let next = text
  for (const [name, raw] of Object.entries(requireRoot(text, `${languageId}.json`))) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      next = applyEdits(
        next,
        modify(next, [name, 'scope'], languageId, { formattingOptions: FORMATTING })
      )
    }
  }
  return next
}
