import { defineFixture } from '../../component-fixtures/component-fixture'
import type { CodezeraSnippetEntry, SnippetsApi } from '../../../../shared/codezera/snippets-types'
import { CodezeraSnippetsSetting } from './CodezeraSnippetsSetting'

const HEADER_BODY = [
  '/**',
  ' * @author Thang Nguyen',
  ' * @date $CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE',
  ' * @purpose ${1:comment purpose here ...}',
  ' */'
]

const ENTRIES: CodezeraSnippetEntry[] = [
  {
    file: 'Snippet.code-snippets',
    name: 'Start Header Comment (PHP)',
    prefixes: ['headerstart'],
    languages: ['php', 'javascript', 'typescript', 'css'],
    include: [],
    exclude: [],
    description: 'PHP docblock with author / auto date / purpose',
    body: HEADER_BODY
  },
  {
    file: 'Snippet.code-snippets',
    name: 'Start Header Comment (TPL)',
    prefixes: ['headerstart'],
    languages: ['smarty', 'tpl', 'html'],
    include: ['**/*.tpl'],
    exclude: [],
    description: 'PHP docblock with author / auto date / purpose',
    body: ['{**', ...HEADER_BODY.slice(1, -1), ' *}']
  },
  {
    file: 'codezera.code-snippets',
    name: 'MediCRM Start',
    prefixes: ['medistart', 'ms'],
    languages: [],
    include: [],
    exclude: [],
    description: '',
    body: ['/** STARTED MEDICRM PROJECT **/']
  }
]

function stubSnippetsApi(entries: CodezeraSnippetEntry[]): void {
  const snippets: SnippetsApi = {
    list: async () => [],
    listEntries: async () => entries,
    save: async () => {},
    delete: async () => {},
    importFromVscode: async () => ({
      sourceDir: '',
      sourceFound: true,
      importedSnippets: 0,
      importedFiles: [],
      unchangedFiles: []
    }),
    onChanged: () => () => {}
  }
  window.api.codezera = { ...window.api.codezera, snippets }
}

const WIDTH = 760

export const list = defineFixture({
  width: WIDTH,
  setup: () => stubSnippetsApi(ENTRIES),
  render: () => <CodezeraSnippetsSetting />
})

export const empty = defineFixture({
  width: WIDTH,
  setup: () => stubSnippetsApi([]),
  render: () => <CodezeraSnippetsSetting />
})

export const editForm = defineFixture({
  width: WIDTH,
  setup: () => stubSnippetsApi(ENTRIES),
  render: () => <CodezeraSnippetsSetting />,
  interact: async (frame) => {
    // Rows appear once the stubbed listEntries promise resolves.
    for (let attempt = 0; attempt < 20; attempt++) {
      const edit = frame.querySelector<HTMLButtonElement>('tbody button[aria-label="Edit"]')
      if (edit) {
        edit.click()
        return
      }
      const { promise, resolve } = Promise.withResolvers<void>()
      setTimeout(resolve, 25)
      await promise
    }
  }
})
