import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import SyncDatabase from '../../sqlite/sync-database'
import { applyStagedOrcaImport, probeOrcaProfile, stageOrcaImport } from './orca-profile-import'

const roots: string[] = []

function makeAppData(): { orca: string; codezera: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'cz-orca-import-'))
  roots.push(root)
  return { orca: path.join(root, 'Orca'), codezera: path.join(root, 'Codezera') }
}

function writeOrcaProfile(orca: string): void {
  const profileDir = path.join(orca, 'profiles', 'local-default')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(
    path.join(orca, 'orca-profile-index.json'),
    JSON.stringify({ schemaVersion: 1, profiles: [{ id: 'local-default' }, { id: '../escape' }] })
  )
  const db = new SyncDatabase(path.join(profileDir, 'profile-state.db'))
  db.exec('CREATE TABLE profile_state_documents (domain TEXT PRIMARY KEY, payload TEXT)')
  const insert = db.prepare('INSERT INTO profile_state_documents VALUES (?, ?)')
  insert.run('repos', JSON.stringify([{ id: 'a' }, { id: 'b' }]))
  insert.run('settings', JSON.stringify({ theme: 'dark' }))
  insert.run('terminalSessions', JSON.stringify({ live: true }))
  db.close()
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Orca profile import', () => {
  it('replaces profile state with Orca config on apply and keeps the old state as backup', () => {
    const { orca, codezera } = makeAppData()
    writeOrcaProfile(orca)
    mkdirSync(path.join(codezera, 'profiles', 'local-default'), { recursive: true })
    writeFileSync(path.join(codezera, 'orca-profile-index.json'), '{"old":true}')
    writeFileSync(path.join(codezera, 'Preferences'), 'chromium')

    expect(probeOrcaProfile(orca, codezera)).toEqual({
      available: true,
      sourcePath: orca,
      projectCount: 2
    })
    stageOrcaImport(orca, codezera)
    // Staging alone must not touch live state: this process still has it open.
    expect(readFileSync(path.join(codezera, 'orca-profile-index.json'), 'utf8')).toBe(
      '{"old":true}'
    )

    const backup = applyStagedOrcaImport(codezera, new Date('2026-10-30T00:00:00Z'))

    expect(backup).not.toBeNull()
    expect(readFileSync(path.join(backup ?? '', 'orca-profile-index.json'), 'utf8')).toBe(
      '{"old":true}'
    )
    const imported = JSON.parse(
      readFileSync(path.join(codezera, 'profiles', 'local-default', 'orca-data.json'), 'utf8')
    )
    expect(imported).toEqual({ repos: [{ id: 'a' }, { id: 'b' }], settings: { theme: 'dark' } })
    expect(existsSync(path.join(codezera, 'Preferences'))).toBe(true)
    expect(existsSync(path.join(codezera, 'profiles', '..', 'escape'))).toBe(false)
    expect(applyStagedOrcaImport(codezera)).toBeNull()
  })

  it('reports no import when Orca has no profile or is the same directory', () => {
    const { orca, codezera } = makeAppData()
    expect(probeOrcaProfile(orca, codezera)).toEqual({ available: false })
    writeOrcaProfile(orca)
    expect(probeOrcaProfile(orca, orca)).toEqual({ available: false })
  })
})
