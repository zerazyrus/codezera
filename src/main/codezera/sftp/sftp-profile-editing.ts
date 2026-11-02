import type { SshTarget } from '../../../shared/ssh-types'
import type {
  SftpConnectionProfile,
  SftpWorkspaceConnections
} from '../../../shared/codezera/sftp-types'
import { normalizeRemotePath } from './vscode-sftp-json'

export function activeSftpProfile(connections: SftpWorkspaceConnections): SftpConnectionProfile {
  return (
    connections.profiles.find((profile) => profile.name === connections.activeProfile) ??
    connections.profiles[0]!
  )
}

function requireProfile(connections: SftpWorkspaceConnections | null, name: string): void {
  if (!connections?.profiles.some((profile) => profile.name === name)) {
    throw new Error(`No SFTP profile "${name}"`)
  }
}

export function withActiveSftpProfile(
  connections: SftpWorkspaceConnections | null,
  name: string
): SftpWorkspaceConnections {
  requireProfile(connections, name)
  return { ...connections!, activeProfile: name }
}

/** Adds (previousName null) or replaces a profile from the connection form, validated and normalized. */
export function withSavedSftpProfile(
  connections: SftpWorkspaceConnections | null,
  previousName: string | null,
  profile: SftpConnectionProfile,
  targets: readonly SshTarget[]
): SftpWorkspaceConnections {
  if (previousName !== null) {
    requireProfile(connections, previousName)
  }
  const existing = connections?.profiles ?? []
  const name = profile.name.trim()
  if (!name) {
    throw new Error('Profile name is required')
  }
  if (existing.some((other) => other.name === name && other.name !== previousName)) {
    throw new Error(`A profile named "${name}" already exists`)
  }
  if (!targets.some((target) => target.id === profile.sshTargetId)) {
    throw new Error('Choose an SSH host')
  }
  const remotePath = profile.remotePath.trim()
  if (!remotePath.startsWith('/')) {
    throw new Error('Remote path must be absolute, e.g. /var/www/site')
  }
  const terminalCommand = profile.terminalCommand?.trim()
  const cleaned: SftpConnectionProfile = {
    name,
    sshTargetId: profile.sshTargetId,
    remotePath: normalizeRemotePath(remotePath),
    uploadOnSave: profile.uploadOnSave,
    ignore: [...new Set(profile.ignore.map((pattern) => pattern.trim()).filter(Boolean))],
    ...(terminalCommand ? { terminalCommand } : {})
  }
  return {
    profiles:
      previousName === null
        ? [...existing, cleaned]
        : existing.map((entry) => (entry.name === previousName ? cleaned : entry)),
    activeProfile:
      !connections || connections.activeProfile === previousName
        ? cleaned.name
        : connections.activeProfile
  }
}

/** Null once the last profile is gone, which removes the workspace's config. */
export function withoutSftpProfile(
  connections: SftpWorkspaceConnections | null,
  name: string
): SftpWorkspaceConnections | null {
  requireProfile(connections, name)
  const profiles = connections!.profiles.filter((profile) => profile.name !== name)
  if (profiles.length === 0) {
    return null
  }
  return {
    profiles,
    activeProfile: profiles.some((profile) => profile.name === connections!.activeProfile)
      ? connections!.activeProfile
      : profiles[0]!.name
  }
}
