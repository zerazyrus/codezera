import { describe, expect, it } from 'vitest'
import type { CodezeraSnippetDraft } from '../../../shared/codezera/snippets-types'
import {
  parseSnippetEntries,
  removeSnippetText,
  scopeLanguageSnippetText,
  toCompletionSnippet,
  upsertSnippetText
} from './snippet-file-format'

// Mirrors the user's real Snippet.code-snippets: header comments, array/string bodies, trailing comma.
const CODE_SNIPPETS = `{
	// Place your global snippets here.
	"Start Header Comment (TPL)": {
		"scope": "smarty,tpl,html",
		"prefix": "headerstart",
		"body": [
			"{**",
			" * @date $CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE",
			"",
			" *}"
		],
		"include": ["**/*.tpl"],
		"description": "PHP docblock",
	},

	"MediCRM Start (JS/CSS)": {
		"scope": "javascript, typescriptreact ,css",
		"prefix": ["medistart", "ms"],
		"body": "/** STARTED MEDICRM PROJECT **/",
		"exclude": ["**/vendor/**"],
		"isFileTemplate": true
	},
	"No prefix": { "body": "x" },
	"Bad body": { "prefix": "bad", "body": 3 },
}`

describe('parseSnippetEntries', () => {
  it('reads JSONC snippets and maps VS Code language ids for Monaco', () => {
    const entries = parseSnippetEntries(CODE_SNIPPETS, 'Snippet.code-snippets')
    expect(entries.map((entry) => entry.name)).toEqual([
      'Start Header Comment (TPL)',
      'MediCRM Start (JS/CSS)'
    ])
    expect(entries[0].body).toEqual([
      '{**',
      ' * @date $CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE',
      '',
      ' *}'
    ])
    expect(entries[1].languages).toEqual(['javascript', 'typescriptreact', 'css'])
    expect(toCompletionSnippet(entries[1])).toEqual({
      name: 'MediCRM Start (JS/CSS)',
      prefixes: ['medistart', 'ms'],
      body: '/** STARTED MEDICRM PROJECT **/',
      description: '',
      scopes: ['javascript', 'typescript', 'css'],
      include: [],
      exclude: ['**/vendor/**'],
      source: 'Snippet.code-snippets'
    })
  })

  it('returns nothing for a non-object root', () => {
    expect(parseSnippetEntries('[1, 2]', 'x.code-snippets')).toEqual([])
  })
})

describe('scopeLanguageSnippetText', () => {
  it('scopes every snippet of a <languageId>.json file to that language, overriding scope', () => {
    const text = `{
	// shell helpers
	"log": { "scope": "php", "prefix": "log", "body": "echo $1;" },
	"usage": { "prefix": "usage", "body": ["usage() {", "}"] }
}`
    const converted = scopeLanguageSnippetText(text, 'shellscript')
    expect(converted).toContain('// shell helpers')
    const entries = parseSnippetEntries(converted, 'shellscript.code-snippets')
    expect(entries.map((entry) => entry.languages)).toEqual([['shellscript'], ['shellscript']])
    expect(toCompletionSnippet(entries[0]).scopes).toEqual(['shell'])
  })
})

describe('upsertSnippetText / removeSnippetText', () => {
  const draft: CodezeraSnippetDraft = {
    name: 'MediCRM Start',
    prefixes: ['ms'],
    languages: [],
    include: [],
    exclude: ['**/vendor/**'],
    description: 'Project banner',
    body: ['/** START **/', '$0']
  }

  it('renames and edits one snippet while keeping comments, siblings and unedited fields', () => {
    const next = upsertSnippetText(
      CODE_SNIPPETS,
      'Snippet.code-snippets',
      'MediCRM Start (JS/CSS)',
      draft
    )
    expect(next).toContain('// Place your global snippets here.')
    const entries = parseSnippetEntries(next, 'Snippet.code-snippets')
    expect(entries[0]).toEqual(parseSnippetEntries(CODE_SNIPPETS, 'Snippet.code-snippets')[0])
    expect(entries[1]).toEqual({ ...draft, file: 'Snippet.code-snippets' })
    // Prefix-less snippets stay in the file even though Settings never lists them.
    expect(next).toContain('"No prefix"')
    expect(next).toContain('"isFileTemplate": true')
    expect(next).not.toContain('"scope": "javascript')
    expect(next).not.toContain('MediCRM Start (JS/CSS)')
  })

  it('adds to an empty file and rejects a name already in the file', () => {
    const added = upsertSnippetText('{}', 'codezera.code-snippets', null, draft)
    expect(parseSnippetEntries(added, 'codezera.code-snippets')).toEqual([
      { ...draft, file: 'codezera.code-snippets' }
    ])
    expect(() =>
      upsertSnippetText(CODE_SNIPPETS, 'Snippet.code-snippets', null, {
        ...draft,
        name: 'Start Header Comment (TPL)'
      })
    ).toThrow(/already exists/)
  })

  it('removes only the named snippet and keeps the header comment above the first one', () => {
    const names = (text: string): string[] =>
      parseSnippetEntries(text, 'Snippet.code-snippets').map((entry) => entry.name)
    const first = removeSnippetText(
      CODE_SNIPPETS,
      'Snippet.code-snippets',
      'Start Header Comment (TPL)'
    )
    expect(names(first)).toEqual(['MediCRM Start (JS/CSS)'])
    expect(first).toContain('// Place your global snippets here.')
    const last = removeSnippetText(
      '{\n\t"a": { "prefix": "a", "body": "a" },\n\t"b": { "prefix": "b", "body": "b" }\n}',
      'x.code-snippets',
      'b'
    )
    expect(last).toBe('{\n\t"a": { "prefix": "a", "body": "a" }\n}')
  })
})
