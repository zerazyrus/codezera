import { describe, expect, it } from 'vitest'
import type { SshTarget } from '../../../shared/ssh-types'
import type { SftpConnectionProfile } from '../../../shared/codezera/sftp-types'
import { withSavedSftpProfile, withoutSftpProfile } from './sftp-profile-editing'

const targets = [{ id: 't1', label: 'h', host: 'h', port: 22, username: 'u' }] as SshTarget[]
const profile = (name: string): SftpConnectionProfile => ({
  name,
  sshTargetId: 't1',
  remotePath: '/srv/',
  uploadOnSave: false,
  ignore: [' .git ', '', '.git']
})

describe('SFTP profile editing', () => {
  const two = { activeProfile: 'dev', profiles: [profile('dev'), profile('prod')] }

  it('normalizes a new profile and makes the first one active', () => {
    expect(withSavedSftpProfile(null, null, profile(' dev '), targets)).toEqual({
      activeProfile: 'dev',
      profiles: [{ ...profile('dev'), remotePath: '/srv', ignore: ['.git'] }]
    })
  })

  it('keeps sudo only when on', () => {
    const saved = (sudo: boolean | undefined): SftpConnectionProfile =>
      withSavedSftpProfile(null, null, { ...profile('dev'), sudo }, targets).profiles[0]!
    expect(saved(true).sudo).toBe(true)
    expect('sudo' in saved(false)).toBe(false)
    expect('sudo' in saved(undefined)).toBe(false)
  })

  it('rejects duplicate names, unknown hosts and relative paths', () => {
    expect(() => withSavedSftpProfile(two, null, profile('prod'), targets)).toThrow('already')
    expect(() =>
      withSavedSftpProfile(two, null, { ...profile('x'), sshTargetId: 'gone' }, targets)
    ).toThrow('SSH host')
    expect(() =>
      withSavedSftpProfile(two, null, { ...profile('x'), remotePath: 'www' }, targets)
    ).toThrow('absolute')
  })

  it('renaming the active profile keeps it active; keeping its own name is allowed', () => {
    expect(withSavedSftpProfile(two, 'dev', profile('stage'), targets)).toMatchObject({
      activeProfile: 'stage',
      profiles: [{ name: 'stage' }, { name: 'prod' }]
    })
    expect(withSavedSftpProfile(two, 'prod', profile('prod'), targets).activeProfile).toBe('dev')
  })

  it('moves the active profile on delete and drops the config with the last one', () => {
    expect(withoutSftpProfile(two, 'dev')).toMatchObject({ activeProfile: 'prod' })
    expect(withoutSftpProfile({ activeProfile: 'dev', profiles: [profile('dev')] }, 'dev')).toBe(
      null
    )
  })
})
