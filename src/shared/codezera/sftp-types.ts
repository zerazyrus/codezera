/** Patterns natizyskunk.sftp users rely on implicitly; prefilled for new profiles and imports. */
export const DEFAULT_SFTP_IGNORE = ['.vscode', '.git', '.DS_Store']

/** Remote command the SSH terminal runs when a profile sets none; `${remotePath}` is substituted. */
export const DEFAULT_SFTP_TERMINAL_COMMAND = 'cd "${remotePath}"; exec $SHELL -l'

/** One server a workspace syncs with; the server itself is an Orca saved SSH host. */
export type SftpConnectionProfile = {
  name: string
  sshTargetId: string
  /** Absolute posix path, no trailing slash except for `/`. */
  remotePath: string
  uploadOnSave: boolean
  /** Globs relative to the workspace root, natizyskunk.sftp style. */
  ignore: string[]
  terminalCommand?: string
}

export type SftpWorkspaceConnections = {
  activeProfile: string
  profiles: SftpConnectionProfile[]
}

/** `sftp-connections.json` in Codezera's userData, keyed by local workspace root path. */
export type SftpConnectionsFile = Record<string, SftpWorkspaceConnections>

/** The active profile of a workspace, as the panel shows it. */
export type SftpWorkspaceSummary = {
  profiles: string[]
  activeProfile: string
  sshTargetId: string
  /** Orca SSH host label; null when that host was removed from Orca. */
  hostLabel: string | null
  /** Where the connection goes after alias resolution, e.g. `root@103.98.161.125:22`. */
  endpoint: string | null
  endpointError: string | null
  remotePath: string
  /** Local folder mapped to remotePath (the workspace root). */
  localRoot: string
  uploadOnSave: boolean
}

export type SftpConfigState =
  | { status: 'missing'; hasVsCodeConfig: boolean }
  | { status: 'invalid'; error: string }
  | {
      status: 'ok'
      summary: SftpWorkspaceSummary
      connections: SftpWorkspaceConnections
      hasVsCodeConfig: boolean
    }

export type SftpRemoteEntry = {
  name: string
  /** Absolute remote path. */
  path: string
  isDirectory: boolean
  size: number
  mtimeMs: number
}

export type SftpTransferResult = {
  files: number
  directories: number
  /** Entries left out by the `ignore` patterns. */
  ignored: number
  bytes: number
  localPath: string
  remotePath: string
}

export type SftpRemoteFile = {
  remotePath: string
  /** False when the server has no file at the mapped path; content is then empty. */
  exists: boolean
  content: string
  /** Diff side label, e.g. `server (prod)`. */
  label: string
}

export type SftpVsCodeImportResult = {
  workspacePath: string
  profiles: string[]
  hostsCreated: string[]
  hostsReused: string[]
  /** Hosts whose sftp.json used a password/passphrase, which is not copied. */
  hostsNeedingCredentials: string[]
  skipped: { profile: string; reason: string }[]
}

export type SftpVsCodeImportAllResult = {
  imported: SftpVsCodeImportResult[]
  /** Workspaces with sftp.json that already had a Codezera config. */
  alreadyConfigured: string[]
  failed: { workspacePath: string; error: string }[]
}

export type SftpWorkspaceRequest = { workspacePath: string }
export type SftpRemotePathRequest = SftpWorkspaceRequest & { remotePath: string }
export type SftpLocalPathRequest = SftpWorkspaceRequest & { localPath: string }
export type SftpSaveProfileRequest = SftpWorkspaceRequest & {
  /** Name of the profile being edited; null adds a new one. */
  previousName: string | null
  profile: SftpConnectionProfile
}

export type SftpApi = {
  getState: (args: SftpWorkspaceRequest) => Promise<SftpConfigState>
  setProfile: (args: SftpWorkspaceRequest & { profile: string }) => Promise<SftpConfigState>
  saveProfile: (args: SftpSaveProfileRequest) => Promise<SftpConfigState>
  deleteProfile: (args: SftpWorkspaceRequest & { profile: string }) => Promise<SftpConfigState>
  /** Copies `.vscode/sftp.json` into Codezera's config, replacing the workspace's current one. */
  importFromVsCode: (args: SftpWorkspaceRequest) => Promise<SftpVsCodeImportResult>
  /** Imports every known local workspace that has sftp.json and no Codezera config yet. */
  importAllFromVsCode: () => Promise<SftpVsCodeImportAllResult>
  list: (args: SftpRemotePathRequest) => Promise<SftpRemoteEntry[]>
  /** Downloads a remote file or folder to its mapped local path. */
  downloadRemote: (args: SftpRemotePathRequest) => Promise<SftpTransferResult>
  /** Downloads the server copy of a local file or folder over it. */
  downloadLocal: (args: SftpLocalPathRequest) => Promise<SftpTransferResult>
  upload: (args: SftpLocalPathRequest) => Promise<SftpTransferResult>
  /** Uploads only when the active profile has `uploadOnSave`; null when it does not apply. */
  uploadOnSave: (args: SftpLocalPathRequest) => Promise<SftpTransferResult | null>
  readRemoteFile: (args: SftpLocalPathRequest) => Promise<SftpRemoteFile>
  /** Shell command that opens an interactive SSH session in remotePath. */
  sshCommand: (args: SftpWorkspaceRequest) => Promise<string>
  disconnect: (args: SftpWorkspaceRequest) => Promise<void>
  /** Fires with the workspace path when its Codezera SFTP config changes. */
  onConfigChanged: (callback: (workspacePath: string) => void) => () => void
}
