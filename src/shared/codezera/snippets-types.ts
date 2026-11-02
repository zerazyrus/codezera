/** One VS Code user/workspace snippet, normalized for Monaco. */
export type CodezeraSnippet = {
  name: string
  prefixes: string[]
  /** Body lines joined with `\n`, still in VS Code snippet syntax. */
  body: string
  description: string
  /** Monaco language ids; empty means every language. */
  scopes: string[]
  include: string[]
  exclude: string[]
  /** Snippet file name, shown next to the suggestion. */
  source: string
}

export type SnippetsApi = {
  /** VS Code user snippets plus the `.vscode/*.code-snippets` of the workspace owning `filePath`. */
  list: (filePath: string) => Promise<CodezeraSnippet[]>
}
