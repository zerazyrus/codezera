import { existsSync } from 'node:fs'
import type { SshTarget } from '../../../shared/ssh-types'
import { resolveUserSshConfigHost } from '../../ssh/config/ssh-config-host-picker'
import type { SftpProfileConfig } from './sftp-config'

/** Where and as whom an sftp.json profile connects once its host alias is resolved. */
export type SftpEndpoint = {
  host: string
  port: number
  username: string
  /** Key files to try in order; the first readable one is used. */
  privateKeyPaths: string[]
  password: string | null
  passphrase: string | null
  connectTimeout: number
  /** Set when `host` is a ~/.ssh/config alias, so a terminal can keep every option of that Host block. */
  sshConfigAlias: string | null
}

type AliasRoute = {
  hostname: string
  port: number
  username: string
  identityFiles: string[]
  proxied: boolean
}

function routeFromSshTarget(host: string, targets: readonly SshTarget[]): AliasRoute | null {
  const alias = host.toLowerCase()
  const target = targets.find(
    (entry) => entry.label.toLowerCase() === alias || entry.configHost?.toLowerCase() === alias
  )
  if (!target?.host) {
    return null
  }
  return {
    hostname: target.host,
    port: target.port,
    username: target.username,
    identityFiles: target.identityFile ? [target.identityFile] : [],
    proxied: Boolean(target.jumpHost || target.proxyCommand)
  }
}

/**
 * Resolves `host` like natizyskunk.sftp resolves ~/.ssh/config aliases, falling back to the
 * SSH hosts saved in Orca so aliases that only live there still work. sftp.json fields win.
 */
export async function resolveSftpEndpoint(
  profile: SftpProfileConfig,
  sshTargets: readonly SshTarget[]
): Promise<SftpEndpoint> {
  const resolved = await resolveUserSshConfigHost(profile.host)
  const sshConfigAlias = resolved ? profile.host : null
  const route: AliasRoute | null = resolved
    ? {
        hostname: resolved.hostname,
        port: resolved.port,
        username: resolved.username,
        identityFiles: resolved.identityFiles,
        proxied: Boolean(resolved.jumpHost || resolved.proxyCommand)
      }
    : routeFromSshTarget(profile.host, sshTargets)
  if (route?.proxied) {
    throw new Error(`${profile.host} uses ProxyJump/ProxyCommand, which SFTP does not support yet`)
  }
  const username = profile.username ?? (route?.username || null)
  if (!username) {
    throw new Error(`No username for ${profile.host}; set "username" in sftp.json`)
  }
  const keyCandidates = profile.privateKeyPath
    ? [profile.privateKeyPath]
    : (route?.identityFiles ?? []).filter((path) => existsSync(path))
  return {
    host: route?.hostname ?? profile.host,
    port: profile.port ?? route?.port ?? 22,
    username,
    privateKeyPaths: keyCandidates,
    password: profile.password,
    passphrase: profile.passphrase,
    connectTimeout: profile.connectTimeout,
    sshConfigAlias
  }
}

export function formatSftpEndpoint(endpoint: SftpEndpoint): string {
  return `${endpoint.username}@${endpoint.host}:${endpoint.port}`
}
