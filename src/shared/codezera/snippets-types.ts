/** New snippets created in Settings land here; other files in the folder are edited in place. */
export const CODEZERA_MANAGED_SNIPPET_FILE = 'codezera.code-snippets'

/** One Codezera snippet, normalized for Monaco completions. */
export type CodezeraSnippet = {
  name: string
  prefixes: string[]
  /** Body lines joined with `\n`, in VS Code snippet syntax. */
  body: string
  description: string
  /** Monaco language ids; empty means every language. */
  scopes: string[]
  include: string[]
  exclude: string[]
  /** Snippet file name, shown next to the suggestion. */
  source: string
}

/** Editable fields of one snippet, as written in a `.code-snippets` file. */
export type CodezeraSnippetDraft = {
  name: string
  prefixes: string[]
  /** Language ids as written in `scope`; empty means every language. */
  languages: string[]
  include: string[]
  /** Not editable in Settings; carried through so saving keeps it. */
  exclude: string[]
  description: string
  body: string[]
}

export type CodezeraSnippetEntry = CodezeraSnippetDraft & {
  /** File name inside the Codezera snippets folder. */
  file: string
}

export type SaveCodezeraSnippetArgs = {
  /** Null for a new snippet, which goes into the Codezera-managed file. */
  file: string | null
  /** Name before editing; null for a new snippet. */
  originalName: string | null
  snippet: CodezeraSnippetDraft
}

export type CodezeraSnippetImportResult = {
  sourceDir: string
  sourceFound: boolean
  /** Snippets in the files that were copied. */
  importedSnippets: number
  importedFiles: string[]
  /** Source files already imported with identical content. */
  unchangedFiles: string[]
}

export type SnippetsApi = {
  /** Every snippet for the Monaco completion provider. */
  list: () => Promise<CodezeraSnippet[]>
  listEntries: () => Promise<CodezeraSnippetEntry[]>
  save: (args: SaveCodezeraSnippetArgs) => Promise<void>
  delete: (args: { file: string; name: string }) => Promise<void>
  importFromVscode: () => Promise<CodezeraSnippetImportResult>
  /** Fires after any save, delete or import. */
  onChanged: (callback: () => void) => () => void
}
