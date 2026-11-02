import { readFile, stat } from 'node:fs/promises'
import { basename, join, posix } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type { SshTarget } from '../../../shared/ssh-types'
import type {
  SftpConfigState,
  SftpRemoteEntry,
  SftpRemoteFile,
  SftpTransferResult
} from '../../../shared/codezera/sftp-types'
import {
  parseSftpConfigText,
  resolveSftpProfile,
  type SftpConfigEntry,
  type SftpProfileConfig
} from './sftp-config'
import { formatSftpEndpoint, resolveSftpEndpoint, type SftpEndpoint } from './sftp-endpoint'
import { createSftpIgnoreMatcher } from './sftp-ignore'
import {
  localRelativePath,
  localToRemotePath,
  remoteRelativePath,
  remoteToLocalPath
} from './sftp-path-mapping'
import { SftpConnectionPool } from './sftp-connection-pool'
import {
  downloadPath,
  listRemoteDirectory,
  readRemoteFileText,
  uploadPath,
  type SftpIgnoreCheck
} from './sftp-transfers'

export type SftpProfileChoiceStore = {
  get: (workspacePath: string) => Promise<string | null>
  set: (workspacePath: string, profile: string) => Promise<void>
}

type LoadedConfig = { mtimeMs: number; size: number; entry: SftpConfigEntry }

type SftpSession = {
  key: string
  profile: SftpProfileConfig
  endpoint: SftpEndpoint
  /** Local folder mapped to `profile.remotePath`. */
  localRoot: string
  isIgnored: SftpIgnoreCheck
}

export function sftpConfigPath(workspacePath: string): string {
  return join(workspacePath, '.vscode', 'sftp.json')
}

function localRootFor(workspacePath: string, profile: SftpProfileConfig): string {
  return profile.context ? join(workspacePath, ...profile.context.split('/')) : workspacePath
}

function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`
}

/** `.vscode/sftp.json` operations for local workspaces, reloading the file whenever it changes. */
export class SftpWorkspaceService {
  private readonly configs = new Map<string, LoadedConfig>()
  private readonly endpoints = new Map<string, Promise<SftpEndpoint>>()

  constructor(
    private readonly profileChoices: SftpProfileChoiceStore,
    private readonly sshTargets: () => readonly SshTarget[],
    private readonly pool = new SftpConnectionPool()
  ) {}

  async getState(workspacePath: string): Promise<SftpConfigState> {
    const configPath = sftpConfigPath(workspacePath)
    let profile: SftpProfileConfig | null
    try {
      profile = await this.loadProfile(workspacePath)
    } catch (error) {
      return { status: 'invalid', configPath, error: errorMessage(error) }
    }
    if (!profile) {
      return { status: 'missing', configPath }
    }
    let endpoint: string | null = null
    let endpointError: string | null = null
    try {
      endpoint = formatSftpEndpoint(await this.endpointFor(workspacePath, profile))
    } catch (error) {
      endpointError = errorMessage(error)
    }
    return {
      status: 'ok',
      summary: {
        configPath,
        name: profile.name,
        profiles: profile.profiles,
        activeProfile: profile.profile,
        host: profile.host,
        endpoint,
        endpointError,
        remotePath: profile.remotePath,
        localRoot: localRootFor(workspacePath, profile),
        uploadOnSave: profile.uploadOnSave
      }
    }
  }

  async setProfile(workspacePath: string, profile: string): Promise<SftpConfigState> {
    const current = await this.loadProfile(workspacePath)
    if (!current?.profiles.includes(profile)) {
      throw new Error(`sftp.json has no profile "${profile}"`)
    }
    await this.profileChoices.set(workspacePath, profile)
    return this.getState(workspacePath)
  }

  async list(workspacePath: string, remoteDir: string): Promise<SftpRemoteEntry[]> {
    const session = await this.requireSession(workspacePath)
    const relativeDir = remoteRelativePath(session.profile.remotePath, remoteDir)
    const sftp = await this.connect(session)
    return listRemoteDirectory(sftp, remoteDir, (name, isDirectory) =>
      session.isIgnored(posix.join(relativeDir, name), isDirectory)
    )
  }

  async downloadRemote(workspacePath: string, remotePath: string): Promise<SftpTransferResult> {
    const session = await this.requireSession(workspacePath)
    const relativePath = remoteRelativePath(session.profile.remotePath, remotePath)
    const localPath = remoteToLocalPath(session.localRoot, session.profile.remotePath, remotePath)
    const sftp = await this.connect(session)
    const counts = await downloadPath(sftp, remotePath, localPath, relativePath, session.isIgnored)
    return { ...counts, localPath, remotePath }
  }

  async downloadLocal(workspacePath: string, localPath: string): Promise<SftpTransferResult> {
    const session = await this.requireSession(workspacePath)
    const remotePath = localToRemotePath(session.localRoot, session.profile.remotePath, localPath)
    const relativePath = localRelativePath(session.localRoot, localPath)
    const sftp = await this.connect(session)
    const counts = await downloadPath(sftp, remotePath, localPath, relativePath, session.isIgnored)
    return { ...counts, localPath, remotePath }
  }

  async upload(workspacePath: string, localPath: string): Promise<SftpTransferResult> {
    return this.uploadWith(await this.requireSession(workspacePath), localPath)
  }

  async uploadOnSave(workspacePath: string, localPath: string): Promise<SftpTransferResult | null> {
    const session = await this.session(workspacePath)
    if (!session?.profile.uploadOnSave) {
      return null
    }
    let relativePath: string
    try {
      relativePath = localRelativePath(session.localRoot, localPath)
    } catch {
      return null
    }
    if (session.isIgnored(relativePath, false)) {
      return null
    }
    return this.uploadWith(session, localPath)
  }

  async readRemoteFile(workspacePath: string, localPath: string): Promise<SftpRemoteFile> {
    const session = await this.requireSession(workspacePath)
    const remotePath = localToRemotePath(session.localRoot, session.profile.remotePath, localPath)
    const sftp = await this.connect(session)
    const content = await readRemoteFileText(sftp, remotePath)
    const profile = session.profile.profile
    return {
      remotePath,
      exists: content !== null,
      content: content ?? '',
      label: profile ? `server (${profile})` : 'server'
    }
  }

  /** Mirrors natizyskunk.sftp's "Open SSH in Terminal": `ssh -t … <sshCustomParams>`. */
  async sshCommand(workspacePath: string): Promise<string> {
    const session = await this.requireSession(workspacePath)
    const { profile, endpoint } = session
    const args = ['ssh', '-t']
    if (endpoint.sshConfigAlias) {
      // Keep the Host block's own options; only fields sftp.json sets explicitly override them.
      if (profile.port) {
        args.push('-p', String(profile.port))
      }
      if (profile.privateKeyPath) {
        args.push('-i', shellQuote(profile.privateKeyPath))
      }
      args.push(
        shellQuote(
          profile.username
            ? `${profile.username}@${endpoint.sshConfigAlias}`
            : endpoint.sshConfigAlias
        )
      )
    } else {
      if (endpoint.port !== 22) {
        args.push('-p', String(endpoint.port))
      }
      if (endpoint.privateKeyPaths[0]) {
        args.push('-i', shellQuote(endpoint.privateKeyPaths[0]))
      }
      args.push(shellQuote(`${endpoint.username}@${endpoint.host}`))
    }
    args.push(
      profile.sshCustomParams
        ? profile.sshCustomParams.replaceAll('${remotePath}', profile.remotePath)
        : shellQuote(`cd ${shellQuote(profile.remotePath)}; exec $SHELL -l`)
    )
    return args.join(' ')
  }

  /** Drops the cached config, endpoints and connections, e.g. after sftp.json changed. */
  invalidate(workspacePath: string): void {
    this.configs.delete(workspacePath)
    this.dropConnections(workspacePath)
  }

  dispose(): void {
    this.pool.closeAll()
  }

  private dropConnections(workspacePath: string): void {
    const prefix = `${workspacePath}\0`
    for (const key of this.endpoints.keys()) {
      if (key.startsWith(prefix)) {
        this.endpoints.delete(key)
      }
    }
    this.pool.closeMatching(prefix)
  }

  private async uploadWith(session: SftpSession, localPath: string): Promise<SftpTransferResult> {
    const remotePath = localToRemotePath(session.localRoot, session.profile.remotePath, localPath)
    const relativePath = localRelativePath(session.localRoot, localPath)
    const sftp = await this.connect(session)
    const counts = await uploadPath(sftp, localPath, remotePath, relativePath, session.isIgnored)
    return { ...counts, localPath, remotePath }
  }

  private async connect(session: SftpSession): Promise<SFTPWrapper> {
    return this.pool.acquire(session.key, session.endpoint)
  }

  private async loadEntry(workspacePath: string): Promise<SftpConfigEntry | null> {
    const configPath = sftpConfigPath(workspacePath)
    const stats = await stat(configPath).catch(() => null)
    if (!stats?.isFile()) {
      this.invalidate(workspacePath)
      return null
    }
    const cached = this.configs.get(workspacePath)
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      return cached.entry
    }
    if (cached) {
      this.dropConnections(workspacePath)
    }
    const entry = parseSftpConfigText(await readFile(configPath, 'utf8'))
    this.configs.set(workspacePath, { mtimeMs: stats.mtimeMs, size: stats.size, entry })
    return entry
  }

  private async loadProfile(workspacePath: string): Promise<SftpProfileConfig | null> {
    const entry = await this.loadEntry(workspacePath)
    return entry ? resolveSftpProfile(entry, await this.profileChoices.get(workspacePath)) : null
  }

  private endpointFor(workspacePath: string, profile: SftpProfileConfig): Promise<SftpEndpoint> {
    const key = `${workspacePath}\0${profile.profile ?? ''}`
    let endpoint = this.endpoints.get(key)
    if (!endpoint) {
      endpoint = resolveSftpEndpoint(profile, this.sshTargets())
      this.endpoints.set(key, endpoint)
      // A failed resolution (alias added later, key fixed) must be retried on the next call.
      endpoint.catch(() => this.endpoints.delete(key))
    }
    return endpoint
  }

  private async session(workspacePath: string): Promise<SftpSession | null> {
    const profile = await this.loadProfile(workspacePath)
    if (!profile) {
      return null
    }
    return {
      key: `${workspacePath}\0${profile.profile ?? ''}`,
      profile,
      endpoint: await this.endpointFor(workspacePath, profile),
      localRoot: localRootFor(workspacePath, profile),
      isIgnored: createSftpIgnoreMatcher(profile.ignore)
    }
  }

  private async requireSession(workspacePath: string): Promise<SftpSession> {
    const session = await this.session(workspacePath)
    if (!session) {
      throw new Error(`No .vscode/sftp.json in ${basename(workspacePath)}`)
    }
    return session
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
