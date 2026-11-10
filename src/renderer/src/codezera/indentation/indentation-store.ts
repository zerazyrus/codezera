import { create } from 'zustand'

export type CodezeraIndentation = {
  insertSpaces: boolean
  tabSize: number
  /** On: each file keeps the style it already uses; the defaults only cover files with no indentation. */
  detectFromContent: boolean
}

const STORAGE_KEY = 'codezera.editor.indentation'
export const MIN_TAB_SIZE = 1
export const MAX_TAB_SIZE = 8
// Matches the editor's behavior before this setting existed.
const DEFAULT_INDENTATION: CodezeraIndentation = {
  insertSpaces: true,
  tabSize: 2,
  detectFromContent: true
}

export function clampTabSize(value: number): number {
  return Math.min(MAX_TAB_SIZE, Math.max(MIN_TAB_SIZE, Math.round(value)))
}

function loadIndentation(): CodezeraIndentation {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<
      Record<keyof CodezeraIndentation, unknown>
    >
    return {
      insertSpaces:
        typeof saved.insertSpaces === 'boolean'
          ? saved.insertSpaces
          : DEFAULT_INDENTATION.insertSpaces,
      tabSize:
        typeof saved.tabSize === 'number' && Number.isFinite(saved.tabSize)
          ? clampTabSize(saved.tabSize)
          : DEFAULT_INDENTATION.tabSize,
      detectFromContent:
        typeof saved.detectFromContent === 'boolean'
          ? saved.detectFromContent
          : DEFAULT_INDENTATION.detectFromContent
    }
  } catch {
    return DEFAULT_INDENTATION
  }
}

type IndentationStore = CodezeraIndentation & {
  update: (patch: Partial<CodezeraIndentation>) => void
}

export const useIndentationStore = create<IndentationStore>((set, get) => ({
  ...(typeof localStorage === 'undefined' ? DEFAULT_INDENTATION : loadIndentation()),
  update: (patch) => {
    set(patch)
    const { insertSpaces, tabSize, detectFromContent } = get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ insertSpaces, tabSize, detectFromContent }))
  }
}))
