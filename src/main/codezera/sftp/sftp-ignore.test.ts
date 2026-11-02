import { describe, expect, it } from 'vitest'
import { createSftpIgnoreMatcher } from './sftp-ignore'

describe('createSftpIgnoreMatcher', () => {
  it('matches bare names at any depth and everything under an ignored folder', () => {
    const ignored = createSftpIgnoreMatcher(['.git', 'node_modules', '.DS_Store'])
    expect(ignored('.git', true)).toBe(true)
    expect(ignored('.git/HEAD', false)).toBe(true)
    expect(ignored('modules/x/.DS_Store', false)).toBe(true)
    expect(ignored('lib/node_modules/pkg/index.js', false)).toBe(true)
    expect(ignored('src/git.php', false)).toBe(false)
    expect(ignored('', true)).toBe(false)
  })

  it('anchors patterns containing a slash and supports * ** ?', () => {
    const ignored = createSftpIgnoreMatcher([
      '/cache',
      'storage/logs',
      '*.log',
      'test/**/*.tmp',
      'v?.txt'
    ])
    expect(ignored('cache/a.php', false)).toBe(true)
    expect(ignored('modules/cache/a.php', false)).toBe(false)
    expect(ignored('storage/logs/today', false)).toBe(true)
    expect(ignored('app/storage/logs', true)).toBe(false)
    expect(ignored('deep/x/error.log', false)).toBe(true)
    expect(ignored('test/a.tmp', false)).toBe(true)
    expect(ignored('test/a/b/c.tmp', false)).toBe(true)
    expect(ignored('other/a.tmp', false)).toBe(false)
    expect(ignored('v1.txt', false)).toBe(true)
    expect(ignored('v10.txt', false)).toBe(false)
  })

  it('applies directory-only patterns and negation', () => {
    const ignored = createSftpIgnoreMatcher(['build/', '*.php', '!keep.php', '# comment', ''])
    expect(ignored('build', false)).toBe(false)
    expect(ignored('build', true)).toBe(true)
    expect(ignored('build/out.js', false)).toBe(true)
    expect(ignored('src/a.php', false)).toBe(true)
    expect(ignored('src/keep.php', false)).toBe(false)
  })
})
