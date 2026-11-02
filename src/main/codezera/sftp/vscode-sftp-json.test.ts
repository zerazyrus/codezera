import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SFTP_IGNORE } from '../../../shared/codezera/sftp-types'
import {
  parseVsCodeSftpJson,
  resolveVsCodeSftpProfile,
  vsCodeSftpProfileNames
} from './vscode-sftp-json'

const KELLYPANG_STYLE = `// natizyskunk.sftp accepts comments and trailing commas
[
  {
    "name": "KellyPang",
    "profiles": {
      "uat": { "host": "CS07", "remotePath": "/var/www/uat/public_html/", "username": "root", "password": "x" },
      "prod": { "host": "CS07", "remotePath": "/var/www/prod/public_html/", "privateKeyPath": "~/.ssh/id_cs07" },
    },
    "uploadOnSave": true,
    "defaultProfile": "prod",
    "port": 2200,
    "username": "deploy",
    "ignore": ["node_modules", ".git"],
    "watcher": { "files": "**/*" }
  }
]`

describe('resolveVsCodeSftpProfile', () => {
  const entry = parseVsCodeSftpJson(KELLYPANG_STYLE)

  it('merges top-level defaults under each profile, profile fields winning', () => {
    expect(vsCodeSftpProfileNames(entry)).toEqual(['uat', 'prod'])
    expect(resolveVsCodeSftpProfile(entry, 'prod')).toMatchObject({
      name: 'prod',
      host: 'CS07',
      port: 2200,
      username: 'deploy',
      usesSecret: false,
      uploadOnSave: true,
      remotePath: '/var/www/prod/public_html',
      privateKeyPath: `${homedir()}/.ssh/id_cs07`,
      ignore: [...DEFAULT_SFTP_IGNORE, 'node_modules']
    })
    expect(resolveVsCodeSftpProfile(entry, 'uat')).toMatchObject({
      username: 'root',
      usesSecret: true,
      remotePath: '/var/www/uat/public_html'
    })
  })

  it('treats a config without profiles as one profile named after the entry', () => {
    const single = parseVsCodeSftpJson('{"host":"h","remotePath":"/"}')
    expect(vsCodeSftpProfileNames(single)).toEqual(['default'])
    expect(resolveVsCodeSftpProfile(single, 'default')).toMatchObject({ remotePath: '/' })
  })

  it('picks the root-context entry of a multi-config file', () => {
    const multi = parseVsCodeSftpJson(
      '[{"context":"sub","host":"a","remotePath":"/a"},{"context":"./","host":"b","remotePath":"/b"}]'
    )
    expect(resolveVsCodeSftpProfile(multi, 'default')).toMatchObject({ host: 'b', context: '' })
  })

  it('rejects configs it cannot connect with', () => {
    expect(() =>
      resolveVsCodeSftpProfile(parseVsCodeSftpJson('{"remotePath":"/x"}'), 'default')
    ).toThrow('no host')
    expect(() =>
      resolveVsCodeSftpProfile(
        parseVsCodeSftpJson('{"host":"h","remotePath":"/x","protocol":"ftp"}'),
        'default'
      )
    ).toThrow('only sftp')
    expect(() => parseVsCodeSftpJson('{"host": ')).toThrow('not valid JSON')
    expect(() => parseVsCodeSftpJson('{"host": 5}')).toThrow('host')
  })
})
