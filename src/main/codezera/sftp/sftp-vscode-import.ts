import { readFile } from 'node:fs/promises'
import type { SshTarget, SshTargetCreateInput } from '../../../shared/ssh-types'
import { normalizeSshConfigAlias } from '../../../shared/ssh-config-alias'
import type {
  SftpConnectionProfile,
  SftpVsCodeImportResult,
  SftpWorkspaceConnections
} from '../../../shared/codezera/sftp-types'
import {
  parseVsCodeSftpJson,
  resolveVsCodeSftpProfile,
  vsCodeSftpJsonPath,
  vsCodeSftpProfileNames,
  type VsCodeSftpProfile
} from './vscode-sftp-json'

/** Where a ~/.ssh/config alias points; null when the name is not an alias. */
export type SshAliasRoute = { hostname: string; port: number; username: string }

export type SftpImportDeps = {
  listTargets: () => readonly SshTarget[]
  addTarget: (input: SshTargetCreateInput) => Promise<SshTarget>
  resolveAlias: (alias: string) => Promise<SshAliasRoute | null>
}

export type SftpTargetDecision =
  | { kind: 'reuse'; target: SshTarget; matchedBy: 'alias' | 'endpoint' }
  | { kind: 'create'; input: SshTargetCreateInput }

/**
 * Maps an sftp.json `host` to an Orca SSH host: same alias (configHost/label) first, then the
 * same host+port+user; otherwise a new manual host built from the alias and sftp.json fields.
 */
export function decideSshTarget(
  profile: VsCodeSftpProfile,
  targets: readonly SshTarget[],
  aliasRoute: SshAliasRoute | null
): SftpTargetDecision {
  const alias = normalizeSshConfigAlias(profile.host)
  const byAlias = targets.find(
    (target) =>
      normalizeSshConfigAlias(target.configHost) === alias ||
      normalizeSshConfigAlias(target.label) === alias
  )
  if (byAlias) {
    return { kind: 'reuse', target: byAlias, matchedBy: 'alias' }
  }
  const host = aliasRoute?.hostname ?? profile.host
  const port = profile.port ?? aliasRoute?.port ?? 22
  const username = profile.username ?? aliasRoute?.username ?? ''
  const byEndpoint = targets.find(
    (target) =>
      target.host.toLowerCase() === host.toLowerCase() &&
      target.port === port &&
      target.username === username
  )
  if (byEndpoint) {
    return { kind: 'reuse', target: byEndpoint, matchedBy: 'endpoint' }
  }
  return {
    kind: 'create',
    input: {
      label: profile.host,
      configHost: aliasRoute ? profile.host : host,
      host,
      port,
      username,
      ...(profile.privateKeyPath ? { identityFile: profile.privateKeyPath } : {}),
      // Manual keeps sftp.json's explicit port/key/user even though the alias exists in ~/.ssh/config.
      source: 'manual'
    }
  }
}

/** VS Code needs `sshCustomParams` single-quoted for its shell; Codezera quotes the command itself. */
export function vsCodeTerminalCommand(sshCustomParams: string | null): string | undefined {
  const value = sshCustomParams?.trim()
  if (!value) {
    return undefined
  }
  const quoted = /^'((?:[^']|'\\'')*)'$/.exec(value)
  return quoted ? quoted[1]!.replaceAll(`'\\''`, `'`) : value
}

function toCodezeraProfile(profile: VsCodeSftpProfile, sshTargetId: string): SftpConnectionProfile {
  const terminalCommand = vsCodeTerminalCommand(profile.sshCustomParams)
  return {
    name: profile.name,
    sshTargetId,
    remotePath: profile.remotePath,
    uploadOnSave: profile.uploadOnSave,
    ignore: profile.ignore,
    ...(terminalCommand ? { terminalCommand } : {})
  }
}

/** Copies a workspace's `.vscode/sftp.json` into Codezera's shape, creating Orca SSH hosts it lacks. */
export async function importVsCodeSftpConfig(
  workspacePath: string,
  deps: SftpImportDeps
): Promise<{ connections: SftpWorkspaceConnections | null; result: SftpVsCodeImportResult }> {
  const entry = parseVsCodeSftpJson(await readFile(vsCodeSftpJsonPath(workspacePath), 'utf8'))
  const result: SftpVsCodeImportResult = {
    workspacePath,
    profiles: [],
    hostsCreated: [],
    hostsReused: [],
    hostsNeedingCredentials: [],
    skipped: []
  }
  const targets = [...deps.listTargets()]
  const createdIds = new Set<string>()
  const profiles: SftpConnectionProfile[] = []

  for (const name of vsCodeSftpProfileNames(entry)) {
    let profile: VsCodeSftpProfile
    try {
      profile = resolveVsCodeSftpProfile(entry, name)
    } catch (error) {
      result.skipped.push({
        profile: name,
        reason: error instanceof Error ? error.message : String(error)
      })
      continue
    }
    if (profile.context) {
      result.skipped.push({
        profile: name,
        reason: `maps subfolder "${profile.context}" (context), which Codezera does not support`
      })
      continue
    }
    const decision = decideSshTarget(profile, targets, await deps.resolveAlias(profile.host))
    let target: SshTarget
    if (decision.kind === 'create') {
      target = await deps.addTarget(decision.input)
      targets.push(target)
      createdIds.add(target.id)
      result.hostsCreated.push(target.label)
    } else {
      target = decision.target
      if (!createdIds.has(target.id) && !result.hostsReused.includes(target.label)) {
        result.hostsReused.push(target.label)
      }
    }
    if (profile.usesSecret && !result.hostsNeedingCredentials.includes(target.label)) {
      result.hostsNeedingCredentials.push(target.label)
    }
    profiles.push(toCodezeraProfile(profile, target.id))
    result.profiles.push(name)
  }

  if (profiles.length === 0) {
    return { connections: null, result }
  }
  const activeProfile =
    entry.defaultProfile && result.profiles.includes(entry.defaultProfile)
      ? entry.defaultProfile
      : profiles[0]!.name
  return { connections: { activeProfile, profiles }, result }
}
