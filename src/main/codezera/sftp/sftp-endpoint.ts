import type { ChildProcess } from 'node:child_process'
import type { ConnectConfig } from 'ssh2'
import type { SshTarget } from '../../../shared/ssh-types'
import {
  isUnencryptedPrivateKey,
  resolvePrivateKeys
} from '../../ssh/authentication/ssh-auth-resolution'
import { resolveWithSshG, type SshResolvedConfig } from '../../ssh/config/ssh-g-config-resolution'
import {
  buildConnectConfig,
  resolveEffectiveSshEndpoint
} from '../../ssh/connection/ssh-connect-config'
import {
  resolveEffectiveProxy,
  spawnProxyCommand
} from '../../ssh/system-transport/ssh-proxy-command'

/** An Orca SSH host merged with `ssh -G`, exactly as Orca's own ssh2 transport sees it. */
export type SftpEndpoint = {
  target: SshTarget
  resolved: SshResolvedConfig | null
  /** `user@host:port` after alias resolution. */
  label: string
}

export async function resolveSftpEndpoint(target: SshTarget): Promise<SftpEndpoint> {
  const resolved = await resolveWithSshG(target.configHost || target.label).catch(() => null)
  const { host, port, username } = resolveEffectiveSshEndpoint(target, resolved)
  if (!username) {
    throw new Error(`SSH host "${target.label}" has no username; set one in Settings › SSH Hosts`)
  }
  return { target, resolved, label: `${username}@${host}:${port}` }
}

/** ssh2 config plus the ProxyJump/ProxyCommand process carrying it, if any. */
export function openSftpConnectConfig(endpoint: SftpEndpoint): {
  config: ConnectConfig
  proxyProcess: ChildProcess | null
} {
  // Orca leaves default-path keys (~/.ssh/id_ed25519) to the agent and retries with them after an
  // agent failure; this pool has no retry ladder, so offer them up front unless one needs a passphrase.
  const keys = resolvePrivateKeys(endpoint.target, endpoint.resolved)
  const allUnencrypted =
    keys.length > 0 && keys.every((key) => isUnencryptedPrivateKey(key.contents))
  const config = buildConnectConfig(endpoint.target, endpoint.resolved, {
    includePrivateKey: allUnencrypted || undefined
  })
  // No prompt UI here: password/MFA hosts fail fast instead of hanging on a challenge.
  config.tryKeyboard = false
  const proxy = resolveEffectiveProxy(endpoint.target, endpoint.resolved)
  if (!proxy) {
    return { config, proxyProcess: null }
  }
  const spawned = spawnProxyCommand(proxy, config.host!, config.port!, config.username!)
  config.sock = spawned.sock
  return { config, proxyProcess: spawned.process }
}

/** Key that changes whenever a routing-relevant field of the target changes. */
export function sftpTargetFingerprint(target: SshTarget): string {
  return JSON.stringify([
    target.id,
    target.configHost,
    target.host,
    target.port,
    target.username,
    target.identityFile,
    target.identityAgent,
    target.identitiesOnly,
    target.jumpHost,
    target.proxyCommand,
    target.source
  ])
}
