import { describe, expect, it } from 'vitest'
import { parseVscodeSnippetFile } from './vscode-snippet-parse'

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
		"exclude": ["**/vendor/**"]
	},
	"No prefix": { "body": "x" },
	"Bad body": { "prefix": "bad", "body": 3 },
}`

describe('parseVscodeSnippetFile', () => {
  it('reads JSONC global snippets with scope, include and exclude', () => {
    expect(parseVscodeSnippetFile(CODE_SNIPPETS, 'Snippet.code-snippets', null)).toEqual([
      {
        name: 'Start Header Comment (TPL)',
        prefixes: ['headerstart'],
        body: '{**\n * @date $CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE\n\n *}',
        description: 'PHP docblock',
        scopes: ['smarty', 'tpl', 'html'],
        include: ['**/*.tpl'],
        exclude: [],
        source: 'Snippet.code-snippets'
      },
      {
        name: 'MediCRM Start (JS/CSS)',
        prefixes: ['medistart', 'ms'],
        body: '/** STARTED MEDICRM PROJECT **/',
        description: '',
        scopes: ['javascript', 'typescript', 'css'],
        include: [],
        exclude: ['**/vendor/**'],
        source: 'Snippet.code-snippets'
      }
    ])
  })

  it('scopes <languageId>.json snippets to that language and ignores their scope field', () => {
    const text = '{ "log": { "scope": "php", "prefix": "log", "body": "echo $1;" } }'
    expect(parseVscodeSnippetFile(text, 'shellscript.json', 'shellscript')[0].scopes).toEqual([
      'shell'
    ])
  })

  it('returns nothing for a non-object root', () => {
    expect(parseVscodeSnippetFile('[1, 2]', 'x.code-snippets', null)).toEqual([])
  })
})
