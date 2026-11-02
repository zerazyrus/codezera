import { existsSync } from 'node:fs'
import { basename, posix } from 'node:path'
import type { SshTarget } from '../../../shared/ssh-types'
import { quotePosixShellUnlessPlain } from '../../../shared/shell-argument-quoting'
import {
  DEFAULT_SFTP_TERMINAL_COMMAND,
  type SftpConfigState,
  type SftpConnectionProfile,
  type SftpRemoteEntry,
  type SftpRemoteFile,
  type SftpSaveProfileRequest,
  type SftpTransferResult,
  type SftpVsCodeImportAllResult,
  type SftpVsCodeImportResult,
  type SftpWorkspaceConnections
} from '../../../shared/codezera/sftp-types'
import { appendSshTargetDestinationArgs } from '../../ssh/system-transport/system-ssh-args'
import type { SftpConnectionStore } from './sftp-connection-store'
import { resolveSftpEndpoint, sftpTargetFingerprint, type SftpEndpoint } from './sftp-endpoint'
import { createSftpIgnoreMatcher } from './sftp-ignore'
import {
  localRelativePath,
  localToRemotePath,
  remoteRelativePath,
  remoteToLocalPath
} from './sftp-path-mapping'
import { SftpConnectionPool, type SftpConnection } from './sftp-connection-pool'
import { SftpSudoPasswords } from './sftp-sudo-upload'
import {
  downloadPath,
  listRemoteDirectory,
  planUpload,
  readRemoteFileText,
  uploadPath,
  type SftpIgnoreCheck
} from './sftp-transfers'
import { importVsCodeSftpConfig, type SftpImportDeps } from './sftp-vscode-import'
import { vsCodeSftpJsonPath } from './vscode-sftp-json'
import {
  activeSftpProfile,
  withActiveSftpProfile,
  withSavedSftpProfile,
  withoutSftpProfile
} from './sftp-profile-editing'

type SftpSession = {
  key: string
  profile: SftpConnectionProfile
  endpoint: SftpEndpoint
  isIgnored: SftpIgnoreCheck
}

/** SFTP operations for local workspaces, configured from Codezera's own connection store. */
export class SftpWorkspaceService {
  private readonly endpoints = new Map<string, Promise<SftpEndpoint>>()
  private readonly sudoPasswords = new SftpSudoPasswords()

  constructor(
    private readonly store: SftpConnectionStore,
    private readonly importDeps: SftpImportDeps,
    private readonly onConfigChanged: (workspacePath: string) => void,
    private readonly pool = new SftpConnectionPool()
  ) {}

  async getState(workspacePath: string): Promise<SftpConfigState> {
    const hasVsCodeConfig = existsSync(vsCodeSftpJsonPath(workspacePath))
    let connections: SftpWorkspaceConnections | null
    try {
      connections = await this.store.get(workspacePath)
    } catch (error) {
      return { status: 'invalid', error: error instanceof Error ? error.message : String(error) }
    }
    if (!connections) {
      return { status: 'missing', hasVsCodeConfig }
    }
    const profile = activeSftpProfile(connections)
    const target = this.findTarget(profile.sshTargetId)
    let endpoint: string | null = null
    let endpointError: string | null = null
    try {
      endpoint = (await this.endpointFor(workspacePath, profile)).label
    } catch (error) {
      endpointError = error instanceof Error ? error.message : String(error)
    }
    return {
      status: 'ok',
      hasVsCodeConfig,
      connections,
      summary: {
        profiles: connections.profiles.map((entry) => entry.name),
        activeProfile: profile.name,
        sshTargetId: profile.sshTargetId,
        hostLabel: target?.label ?? null,
        endpoint,
        endpointError,
        remotePath: profile.remotePath,
        localRoot: workspacePath,
        uploadOnSave: profile.uploadOnSave
      }
    }
  }

  async setProfile(workspacePath: string, profile: string): Promise<SftpConfigState> {
    const connections = await this.store.get(workspacePath)
    await this.write(workspacePath, withActiveSftpProfile(connections, profile))
    return this.getState(workspacePath)
  }

  async saveProfile({
    workspacePath,
    previousName,
    profile
  }: SftpSaveProfileRequest): Promise<SftpConfigState> {
    const connections = await this.store.get(workspacePath)
    const targets = this.importDeps.listTargets()
    await this.write(
      workspacePath,
      withSavedSftpProfile(connections, previousName, profile, targets)
    )
    return this.getState(workspacePath)
  }

  async deleteProfile(workspacePath: string, profile: string): Promise<SftpConfigState> {
    const connections = await this.store.get(workspacePath)
    await this.write(workspacePath, withoutSftpProfile(connections, profile))
    return this.getState(workspacePath)
  }

  async importFromVsCode(workspacePath: string): Promise<SftpVsCodeImportResult> {
    const { connections, result } = await importVsCodeSftpConfig(workspacePath, this.importDeps)
    if (connections) {
      await this.write(workspacePath, connections)
    }
    return result
  }

  /** Imports each workspace that has sftp.json and no Codezera config yet. */
  async importAllFromVsCode(workspacePaths: readonly string[]): Promise<SftpVsCodeImportAllResult> {
    const summary: SftpVsCodeImportAllResult = { imported: [], alreadyConfigured: [], failed: [] }
    for (const workspacePath of workspacePaths) {
      if (!existsSync(vsCodeSftpJsonPath(workspacePath))) {
        continue
      }
      try {
        if (await this.store.get(workspacePath)) {
          summary.alreadyConfigured.push(workspacePath)
          continue
        }
        summary.imported.push(await this.importFromVsCode(workspacePath))
      } catch (error) {
        summary.failed.push({
          workspacePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return summary
  }

  async list(workspacePath: string, remoteDir: string): Promise<SftpRemoteEntry[]> {
    const session = await this.requireSession(workspacePath)
    const relativeDir = remoteRelativePath(session.profile.remotePath, remoteDir)
    const { sftp } = await this.connect(session)
    return listRemoteDirectory(sftp, remoteDir, (name, isDirectory) =>
      session.isIgnored(posix.join(relativeDir, name), isDirectory)
    )
  }

  async downloadRemote(workspacePath: string, remotePath: string): Promise<SftpTransferResult> {
    const session = await this.requireSession(workspacePath)
    const relativePath = remoteRelativePath(session.profile.remotePath, remotePath)
    const localPath = remoteToLocalPath(workspacePath, session.profile.remotePath, remotePath)
    const { sftp } = await this.connect(session)
    const counts = await downloadPath(sftp, remotePath, localPath, relativePath, session.isIgnored)
    return { ...counts, localPath, remotePath }
  }

  async downloadLocal(workspacePath: string, localPath: string): Promise<SftpTransferResult> {
    const session = await this.requireSession(workspacePath)
    const remotePath = localToRemotePath(workspacePath, session.profile.remotePath, localPath)
    const relativePath = localRelativePath(workspacePath, localPath)
    const { sftp } = await this.connect(session)
    const counts = await downloadPath(sftp, remotePath, localPath, relativePath, session.isIgnored)
    return { ...counts, localPath, remotePath }
  }

  async upload(workspacePath: string, localPath: string): Promise<SftpTransferResult> {
    return this.uploadWith(workspacePath, await this.requireSession(workspacePath), localPath)
  }

  async uploadOnSave(workspacePath: string, localPath: string): Promise<SftpTransferResult | null> {
    const session = await this.session(workspacePath)
    if (!session?.profile.uploadOnSave) {
      return null
    }
    let relativePath: string
    try {
      relativePath = localRelativePath(workspacePath, localPath)
    } catch {
      return null
    }
    if (session.isIgnored(relativePath, false)) {
      return null
    }
    return this.uploadWith(workspacePath, session, localPath)
  }

  async readRemoteFile(workspacePath: string, localPath: string): Promise<SftpRemoteFile> {
    const session = await this.requireSession(workspacePath)
    const remotePath = localToRemotePath(workspacePath, session.profile.remotePath, localPath)
    const { sftp } = await this.connect(session)
    const content = await readRemoteFileText(sftp, remotePath)
    return {
      remotePath,
      exists: content !== null,
      content: content ?? '',
      label: `server (${session.profile.name})`
    }
  }

  /** `ssh -t <Orca host> <terminal command>`, routed like Orca's own system ssh. */
  async sshCommand(workspacePath: string): Promise<string> {
    const { profile, endpoint } = await this.requireSession(workspacePath)
    const args: string[] = []
    appendSshTargetDestinationArgs(args, endpoint.target)
    const remoteCommand = (profile.terminalCommand ?? DEFAULT_SFTP_TERMINAL_COMMAND).replaceAll(
      '${remotePath}',
      profile.remotePath
    )
    return ['ssh', '-t', ...args, remoteCommand].map(quotePosixShellUnlessPlain).join(' ')
  }

  async setSudoPassword(workspacePath: string, password: string): Promise<void> {
    this.sudoPasswords.set((await this.requireSession(workspacePath)).profile.sshTargetId, password)
  }

  /** Drops cached endpoints and connections, e.g. after the config or an SSH host changed. */
  invalidate(workspacePath: string): void {
    const prefix = `${workspacePath}\0`
    for (const key of this.endpoints.keys()) {
      if (key.startsWith(prefix)) {
        this.endpoints.delete(key)
      }
    }
    this.pool.closeMatching(prefix)
  }

  dispose(): void {
    this.sudoPasswords.clear()
    this.pool.closeAll()
  }

  private async write(
    workspacePath: string,
    connections: SftpWorkspaceConnections | null
  ): Promise<void> {
    await this.store.set(workspacePath, connections)
    this.invalidate(workspacePath)
    this.onConfigChanged(workspacePath)
  }

  private findTarget(sshTargetId: string): SshTarget | undefined {
    return this.importDeps.listTargets().find((target) => target.id === sshTargetId)
  }

  private async uploadWith(
    workspacePath: string,
    session: SftpSession,
    localPath: string
  ): Promise<SftpTransferResult> {
    const remotePath = localToRemotePath(workspacePath, session.profile.remotePath, localPath)
    const relativePath = localRelativePath(workspacePath, localPath)
    const plan = await planUpload(localPath, remotePath, relativePath, session.isIgnored)
    const connection = await this.connect(session)
    const { sudo, sshTargetId } = session.profile
    const counts = sudo
      ? await this.sudoPasswords.upload(connection, plan, sshTargetId, session.endpoint.label)
      : await uploadPath(connection.sftp, plan)
    return { ...counts, localPath, remotePath }
  }

  private async connect(session: SftpSession): Promise<SftpConnection> {
    return this.pool.acquire(session.key, session.endpoint)
  }

  private sessionKey(workspacePath: string, profile: SftpConnectionProfile): string {
    const target = this.findTarget(profile.sshTargetId)
    // The fingerprint makes an SSH host edited in Orca settings open a fresh connection.
    return `${workspacePath}\0${profile.name}\0${target ? sftpTargetFingerprint(target) : profile.sshTargetId}`
  }

  private endpointFor(
    workspacePath: string,
    profile: SftpConnectionProfile
  ): Promise<SftpEndpoint> {
    const key = this.sessionKey(workspacePath, profile)
    let endpoint = this.endpoints.get(key)
    if (!endpoint) {
      const target = this.findTarget(profile.sshTargetId)
      endpoint = target
        ? resolveSftpEndpoint(target)
        : Promise.reject(
            new Error(`The SSH host of profile "${profile.name}" was removed from Orca; edit it`)
          )
      this.endpoints.set(key, endpoint)
      // A failed resolution (host fixed later) must be retried on the next call.
      endpoint.catch(() => this.endpoints.delete(key))
    }
    return endpoint
  }

  private async session(workspacePath: string): Promise<SftpSession | null> {
    const connections = await this.store.get(workspacePath)
    if (!connections) {
      return null
    }
    const profile = activeSftpProfile(connections)
    return {
      key: this.sessionKey(workspacePath, profile),
      profile,
      endpoint: await this.endpointFor(workspacePath, profile),
      isIgnored: createSftpIgnoreMatcher(profile.ignore)
    }
  }

  private async requireSession(workspacePath: string): Promise<SftpSession> {
    const session = await this.session(workspacePath)
    if (!session) {
      throw new Error(`No SFTP connection for ${basename(workspacePath)}`)
    }
    return session
  }
}
