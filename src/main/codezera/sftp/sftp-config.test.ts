import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SFTP_IGNORE, parseSftpConfigText, resolveSftpProfile } from './sftp-config'

const KELLYPANG_STYLE = `// natizyskunk.sftp accepts comments and trailing commas
[
  {
    "name": "KellyPang",
    "profiles": {
      "uat": { "host": "CS07", "connectTimeout": 40000, "remotePath": "/var/www/uat/public_html/", "username": "root" },
      "prod": { "host": "CS07", "remotePath": "/var/www/prod/public_html/", "privateKeyPath": "~/.ssh/id_cs07" },
    },
    "uploadOnSave": false,
    "defaultProfile": "prod",
    "connectTimeout": 100000,
    "username": "deploy",
    "watcher": { "files": "**/*" }
  }
]`

describe('resolveSftpProfile', () => {
  const entry = parseSftpConfigText(KELLYPANG_STYLE)

  it('uses defaultProfile and lets the profile override top-level fields', () => {
    const profile = resolveSftpProfile(entry, null)
    expect(profile).toMatchObject({
      name: 'KellyPang',
      profiles: ['uat', 'prod'],
      profile: 'prod',
      host: 'CS07',
      username: 'deploy',
      remotePath: '/var/www/prod/public_html',
      connectTimeout: 100000,
      privateKeyPath: `${homedir()}/.ssh/id_cs07`,
      ignore: DEFAULT_SFTP_IGNORE
    })
    expect(resolveSftpProfile(entry, 'uat')).toMatchObject({
      profile: 'uat',
      username: 'root',
      connectTimeout: 40000,
      remotePath: '/var/www/uat/public_html'
    })
  })

  it('falls back to defaultProfile when the remembered profile was removed', () => {
    expect(resolveSftpProfile(entry, 'staging').profile).toBe('prod')
  })

  it('handles a single object without profiles and appends user ignore patterns', () => {
    const single = parseSftpConfigText(
      '{"host":"h","remotePath":"/","uploadOnSave":true,"ignore":["node_modules"]}'
    )
    expect(resolveSftpProfile(single, 'anything')).toMatchObject({
      profile: null,
      profiles: [],
      remotePath: '/',
      uploadOnSave: true,
      ignore: [...DEFAULT_SFTP_IGNORE, 'node_modules']
    })
  })

  it('picks the root-context entry of a multi-config file', () => {
    const multi = parseSftpConfigText(
      '[{"context":"sub","host":"a","remotePath":"/a"},{"context":"./","host":"b","remotePath":"/b"}]'
    )
    expect(resolveSftpProfile(multi, null)).toMatchObject({ host: 'b', context: '' })
  })

  it('rejects configs it cannot connect with', () => {
    expect(() => resolveSftpProfile(parseSftpConfigText('{"remotePath":"/x"}'), null)).toThrow(
      'no host'
    )
    expect(() =>
      resolveSftpProfile(
        parseSftpConfigText('{"host":"h","remotePath":"/x","protocol":"ftp"}'),
        null
      )
    ).toThrow('only sftp')
    expect(() => parseSftpConfigText('{"host": ')).toThrow('not valid JSON')
    expect(() => parseSftpConfigText('{"host": 5}')).toThrow('host')
  })
})
