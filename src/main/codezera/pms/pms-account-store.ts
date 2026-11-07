import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getSecretStore } from '../../../shared/secret-store'
import { writeCredentialFileAtomic } from '../../credentials/integration-credential-file'
import type { PmsAccountInput } from '../../../shared/codezera/pms-types'

const AccountSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/ }))
    .transform((url) => url.replace(/\/+$/, '')),
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
  accessKey: z.string().trim().min(1).max(500)
})

export type PmsAccount = z.infer<typeof AccountSchema>

/** The `/pms` agent skill keeps the same four credentials under other names. */
const SkillConfigSchema = z.object({
  base_url: z.string(),
  username: z.string(),
  web_password: z.string(),
  access_key: z.string()
})

const SKILL_CONFIG_PATH = join(homedir(), '.omp', 'skills', 'pms', 'config.json')

function accountPath(): string {
  return join(app.getPath('userData'), 'codezera', 'pms-account.bin')
}

export function parsePmsAccount(input: unknown): PmsAccount {
  const parsed = AccountSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('Enter the PMS URL, username, password and OpenAPI access key.')
  }
  return parsed.data
}

/** Encrypted with the OS keychain; owner-only plaintext when no keychain exists, like Orca's tracker tokens. */
export function savePmsAccount(account: PmsAccount): void {
  const path = accountPath()
  mkdirSync(join(path, '..'), { recursive: true })
  const json = JSON.stringify(account)
  const store = getSecretStore()
  const data = store.isEncryptionAvailable()
    ? store.encryptString(json)
    : Buffer.from(json, 'utf-8')
  writeCredentialFileAtomic(path, data)
}

export async function loadPmsAccount(): Promise<PmsAccount | null> {
  let raw: Buffer
  try {
    raw = await readFile(accountPath())
  } catch {
    return null
  }
  const store = getSecretStore()
  let json: string
  try {
    json = store.isEncryptionAvailable() ? store.decryptString(raw) : raw.toString('utf-8')
  } catch {
    throw new Error(
      'Could not decrypt the saved PMS account. Approve Keychain access or reconnect.'
    )
  }
  return parsePmsAccount(JSON.parse(json))
}

export async function clearPmsAccount(): Promise<void> {
  await rm(accountPath(), { force: true })
}

export async function readPmsSkillConfig(): Promise<PmsAccountInput | null> {
  try {
    const config = SkillConfigSchema.parse(JSON.parse(await readFile(SKILL_CONFIG_PATH, 'utf8')))
    return {
      baseUrl: config.base_url,
      username: config.username,
      password: config.web_password,
      accessKey: config.access_key
    }
  } catch {
    return null
  }
}
