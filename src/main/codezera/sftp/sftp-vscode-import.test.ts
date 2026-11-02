import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SshTarget, SshTargetCreateInput } from '../../../shared/ssh-types'
import {
  decideSshTarget,
  importVsCodeSftpConfig,
  vsCodeTerminalCommand
} from './sftp-vscode-import'
import type { VsCodeSftpProfile } from './vscode-sftp-json'

const profile = (overrides: Partial<VsCodeSftpProfile>): VsCodeSftpProfile => ({
  name: 'dev',
  host: 'AiNghia',
  port: null,
  username: null,
  usesSecret: false,
  privateKeyPath: null,
  remotePath: '/var/www',
  context: '',
  uploadOnSave: false,
  sshCustomParams: null,
  ignore: [],
  ...overrides
})

const target = (overrides: Partial<SshTarget>): SshTarget => ({
  id: 'ssh-1',
  label: 'other',
  host: '10.0.0.1',
  port: 22,
  username: 'root',
  ...overrides
})

describe('decideSshTarget', () => {
  const route = { hostname: '14.224.165.172', port: 2122, username: 'root' }

  it('reuses a host whose configHost or label is the alias, case-insensitively', () => {
    const byConfigHost = target({ id: 'a', configHost: 'ainghia' })
    expect(decideSshTarget(profile({}), [byConfigHost], route)).toMatchObject({
      kind: 'reuse',
      target: { id: 'a' },
      matchedBy: 'alias'
    })
    const byLabel = target({ id: 'b', label: 'AiNghia' })
    expect(decideSshTarget(profile({}), [byLabel], null)).toMatchObject({ matchedBy: 'alias' })
  })

  it('reuses a host with the same resolved host, port and user', () => {
    const same = target({ id: 'c', host: '14.224.165.172', port: 2122, username: 'root' })
    expect(decideSshTarget(profile({}), [same], route)).toMatchObject({
      kind: 'reuse',
      target: { id: 'c' },
      matchedBy: 'endpoint'
    })
    // sftp.json's own port overrides the alias, so the same machine on another port is a new host.
    expect(decideSshTarget(profile({ port: 22 }), [same], route).kind).toBe('create')
  })

  it('creates a manual host from the alias, sftp.json fields winning over ~/.ssh/config', () => {
    expect(
      decideSshTarget(profile({ username: 'deploy', privateKeyPath: '/k/id' }), [target({})], route)
    ).toEqual({
      kind: 'create',
      input: {
        label: 'AiNghia',
        configHost: 'AiNghia',
        host: '14.224.165.172',
        port: 2122,
        username: 'deploy',
        identityFile: '/k/id',
        source: 'manual'
      }
    })
    expect(decideSshTarget(profile({ host: 'example.com' }), [], null)).toMatchObject({
      input: { label: 'example.com', configHost: 'example.com', host: 'example.com', port: 22 }
    })
  })
})

describe('vsCodeTerminalCommand', () => {
  it('strips the single quotes VS Code needs and unescapes embedded quotes', () => {
    expect(vsCodeTerminalCommand(`'cd "\${remotePath}"; exec bash -l'`)).toBe(
      'cd "${remotePath}"; exec bash -l'
    )
    expect(vsCodeTerminalCommand(`'echo '\\''hi'\\'''`)).toBe(`echo 'hi'`)
    expect(vsCodeTerminalCommand('cd /tmp')).toBe('cd /tmp')
    expect(vsCodeTerminalCommand(`'a' 'b'`)).toBe(`'a' 'b'`)
    expect(vsCodeTerminalCommand('  ')).toBeUndefined()
  })
})

describe('importVsCodeSftpConfig', () => {
  let dir: string | null = null
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  it('creates a shared new host once and flags password profiles', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sftp-import-'))
    mkdirSync(join(dir, '.vscode'))
    writeFileSync(
      join(dir, '.vscode', 'sftp.json'),
      JSON.stringify({
        host: 'CS07',
        username: 'root',
        defaultProfile: 'prod',
        profiles: {
          uat: { remotePath: '/u', password: 'secret' },
          prod: { remotePath: '/p/' },
          sub: { remotePath: '/s', context: 'web' }
        }
      })
    )
    const created: SshTargetCreateInput[] = []
    const { connections, result } = await importVsCodeSftpConfig(dir, {
      listTargets: () => [],
      addTarget: async (input) => {
        created.push(input)
        return { ...input, id: `new-${created.length}` }
      },
      resolveAlias: async () => null
    })
    expect(created).toHaveLength(1)
    expect(connections).toEqual({
      activeProfile: 'prod',
      profiles: [
        expect.objectContaining({ name: 'uat', sshTargetId: 'new-1', remotePath: '/u' }),
        expect.objectContaining({ name: 'prod', sshTargetId: 'new-1', remotePath: '/p' })
      ]
    })
    expect(result).toMatchObject({
      profiles: ['uat', 'prod'],
      hostsCreated: ['CS07'],
      hostsReused: [],
      hostsNeedingCredentials: ['CS07'],
      skipped: [{ profile: 'sub' }]
    })
  })
})
