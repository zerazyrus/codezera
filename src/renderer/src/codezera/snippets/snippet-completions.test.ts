// @vitest-environment happy-dom
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
// @ts-expect-error monaco ships this internal module with an empty .d.ts
import { SnippetController2 } from 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js'
import type * as MonacoApi from 'monaco-editor'
import { CodezeraSnippetStore } from '../../../../main/codezera/snippets/snippet-store'
import {
  registerCodezeraSnippetCompletions,
  setCodezeraSnippetEditorPath
} from './snippet-completions'

const HEADER_LINES = [
  ' * @author Thang Nguyen',
  ' * @date $CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE',
  ' * @purpose ${1:comment purpose here ...}'
]

// The user's Snippet.code-snippets, as imported into the Codezera snippets folder.
const SNIPPET_FILE = JSON.stringify({
  'Start Header Comment (PHP)': {
    scope: 'php,javascript,typescript,css,scss,less',
    prefix: 'headerstart',
    body: ['/**', ...HEADER_LINES, ' */'],
    description: 'PHP docblock with author / auto date / purpose'
  },
  'Start Header Comment (TPL)': {
    scope: 'smarty,tpl,html',
    prefix: 'headerstart',
    body: ['{**', ...HEADER_LINES, ' *}'],
    include: ['**/*.tpl'],
    description: 'PHP docblock with author / auto date / purpose'
  }
})

let provider: MonacoApi.languages.CompletionItemProvider
let snippetDir: string
let store: CodezeraSnippetStore
let notifyChanged: () => void = () => {}

beforeAll(() => {
  snippetDir = mkdtempSync(join(tmpdir(), 'codezera-snippets-'))
  writeFileSync(join(snippetDir, 'Snippet.code-snippets'), SNIPPET_FILE)
  store = new CodezeraSnippetStore(snippetDir)
  // happy-dom has no 2D canvas; the editor only probes it for pixel ratio and glyph widths.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: () => ({ width: 7 })
  } as unknown as CanvasRenderingContext2D)
  // Frozen clock also keeps the completion cache from expiring on its own.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 2, 9, 30))
  monaco.languages.register({ id: 'php' })
  const register = vi.spyOn(monaco.languages, 'registerCompletionItemProvider')
  registerCodezeraSnippetCompletions(monaco as unknown as typeof MonacoApi, {
    list: () => store.listSnippets(),
    onChanged: (callback) => {
      notifyChanged = callback
      return () => {}
    }
  })
  provider = register.mock.calls[0][1]
  register.mockRestore()
})

afterAll(() => {
  vi.useRealTimers()
  rmSync(snippetDir, { recursive: true, force: true })
})

async function expandHeaderStart(
  path: string,
  language: string
): Promise<{
  labels: string[]
  text: string
}> {
  const model = monaco.editor.createModel('headerstart', language, monaco.Uri.file(path))
  const position = new monaco.Position(1, 'headerstart'.length + 1)
  const result = await provider.provideCompletionItems(
    model,
    position,
    { triggerKind: monaco.languages.CompletionTriggerKind.Invoke },
    new monaco.CancellationTokenSource().token
  )
  // Created after the store's file I/O and disposed synchronously, so happy-dom never runs a paint frame.
  const container = document.createElement('div')
  document.body.append(container)
  const editor = monaco.editor.create(container, { model })
  try {
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

describe('registerCodezeraSnippetCompletions', () => {
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

  it('offers snippets in a diff-model editor by its registered file path', async () => {
    // Diff panes are plain code editors over synthetic `diff:` models; the real diff widget needs canvas.
    const modified = monaco.editor.createModel(
      'headerstart',
      'plaintext',
      monaco.Uri.parse('diff:modified:t')
    )
    const unregistered = monaco.editor.createModel(
      'headerstart',
      'plaintext',
      monaco.Uri.parse('diff:original:t')
    )
    const complete = async (model: MonacoApi.editor.ITextModel): Promise<string[] | undefined> => {
      const result = await provider.provideCompletionItems(
        model,
        new monaco.Position(1, 12),
        { triggerKind: monaco.languages.CompletionTriggerKind.Invoke },
        new monaco.CancellationTokenSource().token
      )
      return result?.suggestions.map((s) =>
        typeof s.label === 'string' ? s.label : (s.label.description ?? '')
      )
    }
    expect(await complete(modified)).toBeUndefined()
    const container = document.createElement('div')
    document.body.append(container)
    const editor = monaco.editor.create(container, { model: modified })
    try {
      setCodezeraSnippetEditorPath(editor, '/repo/layouts/Detail.tpl')
      expect(await complete(modified)).toEqual(['Start Header Comment (TPL)'])
      expect(await complete(unregistered)).toBeUndefined()
    } finally {
      editor.dispose()
      modified.dispose()
      unregistered.dispose()
      container.remove()
    }
  })

  it('refetches as soon as the store reports a change', async () => {
    await store.save({
      file: null,
      originalName: null,
      snippet: {
        name: 'Team Header',
        prefixes: ['headerstart'],
        languages: ['php'],
        include: [],
        exclude: [],
        description: '',
        body: ['// team']
      }
    })
    expect((await expandHeaderStart('/repo/a.php', 'php')).labels).toHaveLength(1)
    notifyChanged()
    expect((await expandHeaderStart('/repo/a.php', 'php')).labels).toEqual([
      'Start Header Comment (PHP)',
      'Team Header'
    ])
  })
})
