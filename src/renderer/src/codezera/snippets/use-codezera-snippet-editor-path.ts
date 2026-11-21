import { useEffect } from 'react'
import type * as Monaco from 'monaco-editor'
import { setCodezeraSnippetEditorPath } from './snippet-completions'

/** Lets snippet completions scope by the real file path inside a diff editor's modified side. */
export function useCodezeraSnippetEditorPath(
  editor: Monaco.editor.ICodeEditor | null,
  path: string | undefined
): void {
  useEffect(() => setCodezeraSnippetEditorPath(editor, path), [editor, path])
}
