import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import SyncDatabase from '../../sqlite/sync-database'
import type { OrcaImportProbe } from '../../../shared/codezera/orca-import-types'

// Mirrors config/scripts/dev-profile-seed.mjs: projects, workspaces, settings, SSH targets.
// Terminal sessions, automations (they would run twice), and telemetry stay behind.
const IMPORTED_DOMAINS = [
  'schemaVersion',
  'repos',
  'projects',
  'projectHostSetups',
  'projectGroups',
  'folderWorkspaces',
  'sparsePresetsByRepo',
  'worktreeMeta',
  'worktreeMetaByIdentity',
  'worktreeIdentityAliases',
  'worktreeLineageById',
  'workspaceLineageByChildKey',
  'settings',
  'ui',
  'onboarding',
  'sshTargets',
  'sshTargetGenerationCounter',
  'deletedSshConfigAliases',
  'removedSshTargetTombstones'
]
// The account session is skipped: it is sealed with Orca's safeStorage key, which Codezera cannot read.
const PROFILE_INDEX_FILE = 'orca-profile-index.json'
const LEGACY_DATA_FILE = 'orca-data.json'
const PROFILES_DIR = 'profiles'
const PROFILE_STATE_DATABASE_FILE = 'profile-state.db'
const PROFILE_ID_PATTERN = /^[A-Za-z0-9._-]+$/
/** Profile state entries the import replaces; everything else in userData is left alone. */
const REPLACED_ENTRIES = [PROFILE_INDEX_FILE, PROFILES_DIR, LEGACY_DATA_FILE]
const STAGING_DIR = 'codezera-orca-import'

type Domains = Record<string, unknown>

/** Packaged Orca's userData sits next to Codezera's under the same appData root on every OS. */
export function getOrcaUserDataPath(userDataPath: string): string {
  return path.join(path.dirname(userDataPath), 'Orca')
}

function isSameOrNested(a: string, b: string): boolean {
  const relative = path.relative(path.resolve(a), path.resolve(b))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function readDomains(profileDir: string): Domains | null {
  const databasePath = path.join(profileDir, PROFILE_STATE_DATABASE_FILE)
  if (existsSync(databasePath)) {
    // Read-only: Orca may be running; a reader never writes its pages.
    const db = new SyncDatabase(databasePath, { readonly: true, fileMustExist: true })
    try {
      const domains: Domains = {}
      for (const row of db.prepare('SELECT domain, payload FROM profile_state_documents').all()) {
        if (typeof row.domain === 'string' && typeof row.payload === 'string') {
          domains[row.domain] = JSON.parse(row.payload)
        }
      }
      return domains
    } finally {
      db.close()
    }
  }
  const legacyPath = path.join(profileDir, LEGACY_DATA_FILE)
  return existsSync(legacyPath) ? JSON.parse(readFileSync(legacyPath, 'utf8')) : null
}

function pickImportedDomains(domains: Domains): Domains {
  const picked: Domains = {}
  for (const domain of IMPORTED_DOMAINS) {
    if (domains[domain] !== undefined) {
      picked[domain] = domains[domain]
    }
  }
  return picked
}

function readProfileIds(sourceDir: string): string[] | null {
  const indexPath = path.join(sourceDir, PROFILE_INDEX_FILE)
  if (!existsSync(indexPath)) {
    return null
  }
  const index: unknown = JSON.parse(readFileSync(indexPath, 'utf8'))
  const profiles =
    typeof index === 'object' && index !== null && 'profiles' in index ? index.profiles : null
  return (Array.isArray(profiles) ? profiles : [])
    .map((profile: unknown) =>
      typeof profile === 'object' && profile !== null && 'id' in profile ? profile.id : null
    )
    .filter((id): id is string => typeof id === 'string' && PROFILE_ID_PATTERN.test(id))
}

export function probeOrcaProfile(sourceDir: string, targetDir: string): OrcaImportProbe {
  if (isSameOrNested(sourceDir, targetDir) || isSameOrNested(targetDir, sourceDir)) {
    return { available: false }
  }
  if (!REPLACED_ENTRIES.some((entry) => existsSync(path.join(sourceDir, entry)))) {
    return { available: false }
  }
  const profileDomains = (readProfileIds(sourceDir) ?? ['']).map((id) =>
    readDomains(id ? path.join(sourceDir, PROFILES_DIR, id) : sourceDir)
  )
  const projectCount = profileDomains.reduce(
    (sum, domains) => sum + (Array.isArray(domains?.repos) ? domains.repos.length : 0),
    0
  )
  return { available: true, sourcePath: sourceDir, projectCount }
}

function writePrivateJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  writeFileSync(filePath, JSON.stringify(value), { mode: 0o600 })
}

/**
 * Snapshots Orca's durable config into a staging dir inside targetDir. Live profile files are
 * open in this process, so the swap happens on the next launch in applyStagedOrcaImport.
 * Domains land as legacy orca-data.json, which first launch migrates into SQLite.
 */
export function stageOrcaImport(sourceDir: string, targetDir: string): void {
  if (!probeOrcaProfile(sourceDir, targetDir).available) {
    throw new Error(`No Orca profile to import at ${sourceDir}`)
  }
  const stagingDir = path.join(targetDir, STAGING_DIR)
  const partialDir = `${stagingDir}.partial`
  rmSync(partialDir, { recursive: true, force: true })
  const profileIds = readProfileIds(sourceDir)
  if (profileIds) {
    for (const id of profileIds) {
      const domains = readDomains(path.join(sourceDir, PROFILES_DIR, id))
      if (domains) {
        writePrivateJson(
          path.join(partialDir, PROFILES_DIR, id, LEGACY_DATA_FILE),
          pickImportedDomains(domains)
        )
      }
    }
    writePrivateJson(
      path.join(partialDir, PROFILE_INDEX_FILE),
      JSON.parse(readFileSync(path.join(sourceDir, PROFILE_INDEX_FILE), 'utf8'))
    )
  } else {
    writePrivateJson(
      path.join(partialDir, LEGACY_DATA_FILE),
      pickImportedDomains(readDomains(sourceDir) ?? {})
    )
  }
  // The rename marks the staging dir complete; a crash before it leaves only `.partial`.
  rmSync(stagingDir, { recursive: true, force: true })
  renameSync(partialDir, stagingDir)
}

/**
 * Runs before anything opens profile state. Moves the current profile state into a backup dir
 * and the staged Orca state into its place. Returns the backup dir, or null when nothing was staged.
 */
export function applyStagedOrcaImport(targetDir: string, now: Date = new Date()): string | null {
  const stagingDir = path.join(targetDir, STAGING_DIR)
  if (!existsSync(stagingDir)) {
    return null
  }
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(targetDir, `codezera-before-orca-import-${stamp}`)
  mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  for (const entry of REPLACED_ENTRIES) {
    if (existsSync(path.join(targetDir, entry))) {
      renameSync(path.join(targetDir, entry), path.join(backupDir, entry))
    }
  }
  for (const entry of REPLACED_ENTRIES) {
    if (existsSync(path.join(stagingDir, entry))) {
      renameSync(path.join(stagingDir, entry), path.join(targetDir, entry))
    }
  }
  rmSync(stagingDir, { recursive: true, force: true })
  return backupDir
}
