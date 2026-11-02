/** The active profile of a workspace's `.vscode/sftp.json`, as the panel shows it. */
export type SftpWorkspaceSummary = {
  configPath: string
  name: string | null
  /** Profile names in file order; empty when the config has no `profiles`. */
  profiles: string[]
  activeProfile: string | null
  /** Host as written in sftp.json, often an SSH config alias. */
  host: string
  /** Where the connection really goes after alias resolution, e.g. `root@103.98.161.125:22`; null when it cannot be resolved. */
  endpoint: string | null
  endpointError: string | null
  remotePath: string
  /** Local folder mapped to remotePath: the workspace, or its `context` subfolder. */
  localRoot: string
  uploadOnSave: boolean
}

export type SftpConfigState =
  | { status: 'missing'; configPath: string }
  | { status: 'invalid'; configPath: string; error: string }
  | { status: 'ok'; summary: SftpWorkspaceSummary }

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

export type SftpWorkspaceRequest = { workspacePath: string }
export type SftpRemotePathRequest = SftpWorkspaceRequest & { remotePath: string }
export type SftpLocalPathRequest = SftpWorkspaceRequest & { localPath: string }

export type SftpApi = {
  getState: (args: SftpWorkspaceRequest) => Promise<SftpConfigState>
  setProfile: (args: SftpWorkspaceRequest & { profile: string }) => Promise<SftpConfigState>
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
  /** Fires with the workspace path when its sftp.json changes on disk. */
  onConfigChanged: (callback: (workspacePath: string) => void) => () => void
}
