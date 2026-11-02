import { describe, expect, it } from 'vitest'
import type { CodezeraSnippet } from '../../../../shared/codezera/snippets-types'
import { snippetAppliesTo, snippetReplaceStartColumn } from './snippet-scope-match'

function snippet(fields: Partial<CodezeraSnippet>): CodezeraSnippet {
  return {
    name: 'test',
    prefixes: ['x'],
    body: 'x',
    description: '',
    scopes: [],
    include: [],
    exclude: [],
    source: 'test.code-snippets',
    ...fields
  }
}

describe('snippetAppliesTo', () => {
  const tpl = snippet({ scopes: ['smarty', 'tpl', 'html'], include: ['**/*.tpl'] })
  const php = snippet({ scopes: ['php', 'javascript'] })

  it('matches by language id', () => {
    expect(snippetAppliesTo(php, 'php', '/repo/a.php')).toBe(true)
    expect(snippetAppliesTo(php, 'plaintext', '/repo/a.tpl')).toBe(false)
    expect(snippetAppliesTo(tpl, 'html', '/repo/index.html')).toBe(true)
  })

  it('lets include globs reach files Orca maps to plaintext', () => {
    expect(snippetAppliesTo(tpl, 'plaintext', '/repo/layouts/v7/Detail.tpl')).toBe(true)
    expect(snippetAppliesTo(tpl, 'php', '/repo/modules/Foo.php')).toBe(false)
  })

  it('matches separator-free include patterns against the file name', () => {
    expect(snippetAppliesTo(snippet({ include: ['*.tpl'] }), 'plaintext', '/a/b/c.tpl')).toBe(true)
  })

  it('treats empty scope as all languages unless include narrows it', () => {
    expect(snippetAppliesTo(snippet({}), 'rust', '/a/main.rs')).toBe(true)
    const narrowed = snippet({ include: ['**/*.tpl'] })
    expect(snippetAppliesTo(narrowed, 'rust', '/a/main.rs')).toBe(false)
    expect(snippetAppliesTo(narrowed, 'plaintext', '/a/x.tpl')).toBe(true)
  })

  it('lets exclude override scope and include', () => {
    const excluded = snippet({ scopes: ['php'], include: ['**/*.tpl'], exclude: ['**/vendor/**'] })
    expect(snippetAppliesTo(excluded, 'php', '/repo/vendor/lib/a.php')).toBe(false)
    expect(snippetAppliesTo(excluded, 'plaintext', '/repo/vendor/x.tpl')).toBe(false)
    expect(snippetAppliesTo(excluded, 'php', '/repo/src/a.php')).toBe(true)
  })
})

describe('snippetReplaceStartColumn', () => {
  it('keeps the word start for word-only prefixes', () => {
    expect(snippetReplaceStartColumn('  head', 'headerstart', 3)).toBe(3)
  })

  it('reaches back over non-word chars that begin the prefix', () => {
    expect(snippetReplaceStartColumn('foo @da', '@date', 6)).toBe(5)
    expect(snippetReplaceStartColumn('{*', '{* note *}', 3)).toBe(1)
  })
})
