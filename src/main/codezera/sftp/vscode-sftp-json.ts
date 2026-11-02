import { homedir } from 'node:os'
import { join, posix } from 'node:path'
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser'
import { z } from 'zod'
import { DEFAULT_SFTP_IGNORE } from '../../../shared/codezera/sftp-types'

// Unknown natizyskunk fields (watcher, remoteExplorer, …) are stripped, not rejected.
const SftpFieldsSchema = z.object({
  name: z.string().optional(),
  context: z.string().optional(),
  protocol: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  passphrase: z.union([z.string(), z.boolean()]).optional(),
  privateKeyPath: z.string().optional(),
  remotePath: z.string().optional(),
  uploadOnSave: z.boolean().optional(),
  sshCustomParams: z.string().optional(),
  ignore: z.array(z.string()).optional()
})

const SftpEntrySchema = SftpFieldsSchema.extend({
  profiles: z.record(z.string(), SftpFieldsSchema).optional(),
  defaultProfile: z.string().optional()
})

export type VsCodeSftpEntry = z.infer<typeof SftpEntrySchema>

/** One VS Code sftp.json profile with the top-level defaults merged under it. */
export type VsCodeSftpProfile = {
  /** Profile key, or the entry `name` (else `default`) for a config without `profiles`. */
  name: string
  host: string
  port: number | null
  username: string | null
  /** True when sftp.json authenticates with a password or a string passphrase. */
  usesSecret: boolean
  privateKeyPath: string | null
  /** Posix, no trailing slash except for `/`. */
  remotePath: string
  /** Local subfolder (relative to the workspace) that maps to remotePath; '' for the root. */
  context: string
  uploadOnSave: boolean
  sshCustomParams: string | null
  ignore: string[]
}

export function vsCodeSftpJsonPath(workspacePath: string): string {
  return join(workspacePath, '.vscode', 'sftp.json')
}

/** Parses sftp.json (JSONC, object or array) and returns the entry for the workspace root. */
export function parseVsCodeSftpJson(text: string): VsCodeSftpEntry {
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
  // Multi-config files scope extra entries to subfolders via `context`; the root entry is the workspace's.
  return entries.find((entry) => normalizeContext(entry.context) === '') ?? entries[0]!
}

/** Profile names in file order; a config without `profiles` has one implicit profile. */
export function vsCodeSftpProfileNames(entry: VsCodeSftpEntry): string[] {
  const names = Object.keys(entry.profiles ?? {})
  return names.length > 0 ? names : [entry.name?.trim() || 'default']
}

export function resolveVsCodeSftpProfile(
  entry: VsCodeSftpEntry,
  profileName: string
): VsCodeSftpProfile {
  const { profiles: profileMap = {}, defaultProfile: _defaultProfile, ...defaults } = entry
  const hasProfiles = Object.keys(profileMap).length > 0
  const merged = { ...defaults, ...(hasProfiles ? profileMap[profileName] : {}) }

  if (merged.protocol && merged.protocol !== 'sftp') {
    throw new Error(`protocol "${merged.protocol}" is not supported; only sftp is`)
  }
  const host = merged.host?.trim()
  if (!host) {
    throw new Error('no host')
  }
  const remotePath = merged.remotePath?.trim()
  if (!remotePath) {
    throw new Error('no remotePath')
  }
  const privateKeyPath = merged.privateKeyPath || null
  return {
    name: profileName,
    host,
    port: merged.port ?? null,
    username: merged.username || null,
    usesSecret: Boolean(merged.password) || typeof merged.passphrase === 'string',
    privateKeyPath:
      privateKeyPath === '~' || privateKeyPath?.startsWith('~/')
        ? homedir() + privateKeyPath.slice(1)
        : privateKeyPath,
    remotePath: normalizeRemotePath(remotePath),
    context: normalizeContext(merged.context),
    uploadOnSave: merged.uploadOnSave === true,
    sshCustomParams: merged.sshCustomParams || null,
    ignore: [...new Set([...DEFAULT_SFTP_IGNORE, ...(merged.ignore ?? [])])]
  }
}

export function normalizeRemotePath(remotePath: string): string {
  const normalized = posix.normalize(remotePath)
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function normalizeContext(value: string | undefined): string {
  const context = posix.normalize((value ?? '.').replaceAll('\\', '/'))
  const trimmed = context.replace(/^\.\/?/, '').replace(/\/$/, '')
  return trimmed === '.' ? '' : trimmed
}
