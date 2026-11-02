// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { SnippetController2 } from 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js'
import type * as MonacoApi from 'monaco-editor'
import type { CodezeraSnippet } from '../../../../shared/codezera/snippets-types'
import { registerCodezeraUserSnippets } from './user-snippet-completions'

const HEADER_LINES = [
  ' * @author Thang Nguyen',
  ' * @date $CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE',
  ' * @purpose ${1:comment purpose here ...}'
]

// Same shape the main-process parser yields for the user's Snippet.code-snippets.
const SNIPPETS: CodezeraSnippet[] = [
  {
    name: 'Start Header Comment (PHP)',
    prefixes: ['headerstart'],
    body: ['/**', ...HEADER_LINES, ' */'].join('\n'),
    description: 'PHP docblock with author / auto date / purpose',
    scopes: ['php', 'javascript', 'typescript', 'css', 'scss', 'less'],
    include: [],
    exclude: [],
    source: 'Snippet.code-snippets'
  },
  {
    name: 'Start Header Comment (TPL)',
    prefixes: ['headerstart'],
    body: ['{**', ...HEADER_LINES, ' *}'].join('\n'),
    description: 'PHP docblock with author / auto date / purpose',
    scopes: ['smarty', 'tpl', 'html'],
    include: ['**/*.tpl'],
    exclude: [],
    source: 'Snippet.code-snippets'
  }
]

let provider: MonacoApi.languages.CompletionItemProvider
const listSnippets = vi.fn(async () => SNIPPETS)

beforeAll(() => {
  // happy-dom has no 2D canvas; the editor only probes it for pixel ratio and glyph widths.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: () => ({ width: 7 })
  } as unknown as CanvasRenderingContext2D)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 2, 9, 30))
  monaco.languages.register({ id: 'php' })
  const register = vi.spyOn(monaco.languages, 'registerCompletionItemProvider')
  registerCodezeraUserSnippets(monaco as unknown as typeof MonacoApi, listSnippets)
  provider = register.mock.calls[0][1]
  register.mockRestore()
})

afterAll(() => {
  vi.useRealTimers()
})

async function expandHeaderStart(
  path: string,
  language: string
): Promise<{
  labels: string[]
  text: string
}> {
  const container = document.createElement('div')
  document.body.append(container)
  const model = monaco.editor.createModel('headerstart', language, monaco.Uri.file(path))
  const editor = monaco.editor.create(container, { model })
  try {
    const position = new monaco.Position(1, 'headerstart'.length + 1)
    const result = await provider.provideCompletionItems(
      model,
      position,
      { triggerKind: monaco.languages.CompletionTriggerKind.Invoke },
      new monaco.CancellationTokenSource().token
    )
    const suggestions = result?.suggestions ?? []
    const item = suggestions[0]
    expect(item.kind).toBe(monaco.languages.CompletionItemKind.Snippet)
    expect(item.insertTextRules).toBe(monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet)
    // Insert exactly as the suggest widget does: replace the item range through the snippet engine.
    const range = item.range as MonacoApi.IRange
    editor.setSelection(range)
    SnippetController2.get(editor)?.insert(item.insertText)
    return {
      labels: suggestions.map((s) =>
        typeof s.label === 'string' ? s.label : (s.label.description ?? '')
      ),
      text: model.getValue()
    }
  } finally {
    editor.dispose()
    model.dispose()
    container.remove()
  }
}

describe('registerCodezeraUserSnippets', () => {
  it('expands the PHP header with Monaco-resolved date variables in a .php file', async () => {
    const { labels, text } = await expandHeaderStart('/repo/modules/Foo.php', 'php')
    expect(labels).toEqual(['Start Header Comment (PHP)'])
    expect(text).toBe(
      [
        '/**',
        ' * @author Thang Nguyen',
        ' * @date 2026-11-02',
        ' * @purpose comment purpose here ...',
        ' */'
      ].join('\n')
    )
    expect(listSnippets).toHaveBeenCalledWith('/repo/modules/Foo.php')
  })

  it('offers only the {** TPL variant for a plaintext .tpl file via its include glob', async () => {
    const { labels, text } = await expandHeaderStart('/repo/layouts/Detail.tpl', 'plaintext')
    expect(labels).toEqual(['Start Header Comment (TPL)'])
    expect(text.split('\n')[0]).toBe('{**')
    expect(text).toContain(' * @date 2026-11-02')
    expect(text.endsWith(' *}')).toBe(true)
  })

  it('ignores models outside editor tabs', async () => {
    const model = monaco.editor.createModel('headerstart', 'php')
    const result = await provider.provideCompletionItems(
      model,
      new monaco.Position(1, 12),
      { triggerKind: monaco.languages.CompletionTriggerKind.Invoke },
      new monaco.CancellationTokenSource().token
    )
    expect(result).toBeUndefined()
    model.dispose()
  })
})
