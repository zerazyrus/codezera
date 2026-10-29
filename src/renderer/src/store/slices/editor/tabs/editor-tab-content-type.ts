import type { Tab } from '../../../../../../shared/tab-types'
import type { OpenFile } from '../types/open-file'

export type EditorTabContentType = Extract<
  Tab['contentType'],
  'editor' | 'diff' | 'conflict-review' | 'check-details'
>

export function isEditorTabContentType(
  contentType: Tab['contentType']
): contentType is EditorTabContentType {
  return (
    contentType === 'editor' ||
    contentType === 'diff' ||
    contentType === 'conflict-review' ||
    contentType === 'check-details'
  )
}

/** Editor tabs with no file behind them: their path is a synthetic id, never a workspace path. */
export function isVirtualEditorFile(file: Pick<OpenFile, 'mode'>): boolean {
  return file.mode === 'check-details' || file.mode === 'codezera-panel'
}

export function editorTabContentTypeForMode(mode: OpenFile['mode']): EditorTabContentType {
  if (mode === 'codezera-panel') {
    // Codezera panels ride the transient check-details tab kind: never restored from disk.
    return 'check-details'
  }
  return mode === 'conflict-review' || mode === 'check-details' || mode === 'diff' ? mode : 'editor'
}
