import type * as Monaco from 'monaco-editor'
import { useIndentationStore, type CodezeraIndentation } from './indentation-store'

function applyIndentation(model: Monaco.editor.ITextModel | null, s: CodezeraIndentation): void {
  if (!model || model.isDisposed()) {
    return
  }
  if (s.detectFromContent) {
    model.detectIndentation(s.insertSpaces, s.tabSize)
    return
  }
  model.updateOptions({ insertSpaces: s.insertSpaces, tabSize: s.tabSize, indentSize: s.tabSize })
}

/**
 * Applies the Codezera indentation setting to every editor model.
 * Runs on model attach because each editor's options rewrite Monaco's global `editor.tabSize`,
 * which re-detects the indentation of already-created models.
 */
export function installCodezeraIndentation(monaco: typeof Monaco): void {
  monaco.editor.onDidCreateEditor((editor) => {
    applyIndentation(editor.getModel(), useIndentationStore.getState())
    editor.onDidChangeModel(() =>
      applyIndentation(editor.getModel(), useIndentationStore.getState())
    )
  })
  useIndentationStore.subscribe((state) => {
    for (const model of monaco.editor.getModels()) {
      applyIndentation(model, state)
    }
  })
}
