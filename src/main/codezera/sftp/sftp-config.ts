import { homedir } from 'node:os'
import { posix } from 'node:path'
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser'
import { z } from 'zod'

/** Patterns natizyskunk.sftp users rely on implicitly; merged with the config's own `ignore`. */
export const DEFAULT_SFTP_IGNORE = ['.vscode', '.git', '.DS_Store']

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000

// Unknown natizyskunk fields (watcher, remoteExplorer, …) are stripped, not rejected.
const SftpFieldsSchema = z.object({
  name: z.string().optional(),
  context: z.string().optional(),
  protocol: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  // natizyskunk accepts `true` to prompt; there is no prompt here, so only a string passphrase is used.
  passphrase: z.union([z.string(), z.boolean()]).optional(),
  privateKeyPath: z.string().optional(),
  remotePath: z.string().optional(),
  connectTimeout: z.number().int().positive().optional(),
  uploadOnSave: z.boolean().optional(),
  sshCustomParams: z.string().optional(),
  ignore: z.array(z.string()).optional()
})

const SftpEntrySchema = SftpFieldsSchema.extend({
  profiles: z.record(z.string(), SftpFieldsSchema).optional(),
  defaultProfile: z.string().optional()
})

export type SftpConfigEntry = z.infer<typeof SftpEntrySchema>

/** One sftp.json entry with its chosen profile merged over the top-level defaults. */
export type SftpProfileConfig = {
  name: string | null
  profiles: string[]
  defaultProfile: string | null
  /** Null when the config has no `profiles`. */
  profile: string | null
  host: string
  port: number | null
  username: string | null
  password: string | null
  passphrase: string | null
  privateKeyPath: string | null
  /** Posix, no trailing slash except for `/`. */
  remotePath: string
  /** Local subfolder (relative to the workspace) that maps to remotePath; '' for the root. */
  context: string
  connectTimeout: number
  uploadOnSave: boolean
  sshCustomParams: string | null
  ignore: string[]
}

/** Parses sftp.json (JSONC, object or array) and returns the entry for the workspace root. */
export function parseSftpConfigText(text: string): SftpConfigEntry {
  const errors: ParseError[] = []
  const value: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    throw new Error(`sftp.json is not valid JSON (${printParseErrorCode(errors[0]!.error)})`)
  }
  const isArray = Array.isArray(value)
  const parsed = z
    .array(SftpEntrySchema)
    .min(1)
    .safeParse(isArray ? value : [value])
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = (isArray ? issue?.path : issue?.path.slice(1))?.join('.') || 'config'
    throw new Error(`sftp.json: ${path}: ${issue?.message ?? 'invalid'}`)
  }
  const entries = parsed.data
  // Multi-config files scope extra entries to subfolders via `context`; the root entry drives the panel.
  return entries.find((entry) => normalizeContext(entry.context) === '') ?? entries[0]!
}

export function resolveSftpProfile(
  entry: SftpConfigEntry,
  requestedProfile: string | null
): SftpProfileConfig {
  const { profiles: profileMap = {}, defaultProfile, ...defaults } = entry
  const profiles = Object.keys(profileMap)
  const profile =
    [requestedProfile, defaultProfile].find((name) => name && profiles.includes(name)) ??
    profiles[0] ??
    null
  const merged = { ...defaults, ...(profile ? profileMap[profile] : {}) }

  if (merged.protocol && merged.protocol !== 'sftp') {
    throw new Error(`Protocol "${merged.protocol}" is not supported; only sftp is`)
  }
  const host = merged.host?.trim()
  if (!host) {
    throw new Error(profile ? `Profile "${profile}" has no host` : 'sftp.json has no host')
  }
  const remotePath = merged.remotePath?.trim()
  if (!remotePath) {
    throw new Error(
      profile ? `Profile "${profile}" has no remotePath` : 'sftp.json has no remotePath'
    )
  }
  const normalizedRemote = posix.normalize(remotePath)
  const privateKeyPath = merged.privateKeyPath || null

  return {
    name: merged.name || null,
    profiles,
    defaultProfile: defaultProfile || null,
    profile,
    host,
    port: merged.port ?? null,
    username: merged.username || null,
    password: merged.password || null,
    passphrase: typeof merged.passphrase === 'string' ? merged.passphrase : null,
    privateKeyPath:
      privateKeyPath === '~' || privateKeyPath?.startsWith('~/')
        ? homedir() + privateKeyPath.slice(1)
        : privateKeyPath,
    remotePath:
      normalizedRemote.length > 1 && normalizedRemote.endsWith('/')
        ? normalizedRemote.slice(0, -1)
        : normalizedRemote,
    context: normalizeContext(merged.context),
    connectTimeout: merged.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT_MS,
    uploadOnSave: merged.uploadOnSave === true,
    sshCustomParams: merged.sshCustomParams || null,
    ignore: [...DEFAULT_SFTP_IGNORE, ...(merged.ignore ?? [])]
  }
}

function normalizeContext(value: string | undefined): string {
  const context = posix.normalize((value ?? '.').replaceAll('\\', '/'))
  const trimmed = context.replace(/^\.\/?/, '').replace(/\/$/, '')
  return trimmed === '.' ? '' : trimmed
}
