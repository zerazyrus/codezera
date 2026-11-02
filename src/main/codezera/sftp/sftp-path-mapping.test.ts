import { describe, expect, it } from 'vitest'
import { localToRemotePath, remoteToLocalPath } from './sftp-path-mapping'

describe('sftp path mapping', () => {
  const localRoot = '/Users/me/Projects/site'
  const remoteRoot = '/var/www/site/public_html'

  it('maps local paths under the workspace to remotePath and back', () => {
    expect(localToRemotePath(localRoot, remoteRoot, `${localRoot}/modules/a.php`)).toBe(
      `${remoteRoot}/modules/a.php`
    )
    expect(localToRemotePath(localRoot, remoteRoot, localRoot)).toBe(remoteRoot)
    expect(remoteToLocalPath(localRoot, remoteRoot, `${remoteRoot}/modules/a.php`)).toBe(
      `${localRoot}/modules/a.php`
    )
    expect(remoteToLocalPath(localRoot, remoteRoot, `${remoteRoot}/`)).toBe(localRoot)
    expect(localToRemotePath(localRoot, '/', `${localRoot}/x`)).toBe('/x')
  })

  it('refuses paths outside either root, including look-alike prefixes', () => {
    expect(() => localToRemotePath(localRoot, remoteRoot, '/Users/me/Projects/site2/a')).toThrow(
      'outside'
    )
    expect(() => localToRemotePath(localRoot, remoteRoot, `${localRoot}/../x`)).toThrow('outside')
    expect(() => remoteToLocalPath(localRoot, remoteRoot, '/var/www/site/config.php')).toThrow(
      'outside'
    )
    expect(() => remoteToLocalPath(localRoot, remoteRoot, `${remoteRoot}/../../etc`)).toThrow(
      'outside'
    )
  })

  it('keeps names that merely start with two dots', () => {
    expect(localToRemotePath(localRoot, remoteRoot, `${localRoot}/..hidden`)).toBe(
      `${remoteRoot}/..hidden`
    )
  })
})
