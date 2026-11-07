import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { createNewTerminalTab } from '@/components/terminal/terminal-tab-create'
import {
  SFTP_SUDO_PASSWORD_REQUIRED,
  SFTP_SUDO_PASSWORD_WRONG,
  type SftpTransferResult
} from '../../../../shared/codezera/sftp-types'
import type { RuntimeFileOperationArgs } from '@/runtime/files/runtime-file-client-types'
import { sftpAvailable, useSftpStore, type SftpWorkspace } from './sftp-store'
import { promptSudoPassword } from './sftp-sudo-password-dialog'

export const SFTP_COMPARE_PATH_MARKER = '::codezera::sftp-compare::'

export function sftpErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Electron prefixes main-process rejections with the channel name; sudo markers are for code.
  return message
    .replace(/^Error invoking remote method '[^']+': ([A-Za-z]*Error: )?/, '')
    .replace(/ \(codezera-sftp-sudo-[a-z-]+\)$/, '')
}

/** The user closed the sudo password dialog; the upload stops without an error toast. */
class SftpSudoCancelled extends Error {}

/** Runs an upload; when the server needs the sudo password, asks for it once and retries. */
async function withSudoPassword<T>(workspacePath: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const wrong = message.includes(SFTP_SUDO_PASSWORD_WRONG)
    if (!wrong && !message.includes(SFTP_SUDO_PASSWORD_REQUIRED)) {
      throw error
    }
    const state =
      useSftpStore.getState().states[workspacePath] ??
      (await useSftpStore.getState().load(workspacePath))
    const account =
      state?.status === 'ok'
        ? (state.summary.endpoint?.replace(/:\d+$/, '') ?? state.summary.hostLabel ?? '')
        : ''
    const password = await promptSudoPassword(account, wrong)
    if (password === null) {
      throw new SftpSudoCancelled()
    }
    await window.api.codezera.sftp.setSudoPassword({ workspacePath, password })
    return run()
  }
}

function fileName(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path
}

function profileLabel(workspacePath: string): string {
  const state = useSftpStore.getState().states[workspacePath]
  const profile = state?.status === 'ok' ? state.summary.activeProfile : null
  return profile
    ? translate('codezera.sftp.serverProfile', 'server ({{profile}})', { profile })
    : translate('codezera.sftp.server', 'server')
}

function transferDescription(result: SftpTransferResult, path: string): string {
  const ignored =
    result.ignored > 0
      ? translate('codezera.sftp.ignoredCount', ' · {{count}} ignored', { count: result.ignored })
      : ''
  return `${path}${ignored}`
}

async function runTransfer(
  workspace: SftpWorkspace,
  kind: 'upload' | 'download',
  run: () => Promise<SftpTransferResult>,
  targetName: string
): Promise<SftpTransferResult | null> {
  const server = profileLabel(workspace.workspacePath)
  const pending =
    kind === 'upload'
      ? translate('codezera.sftp.uploading', 'Uploading {{name}} to {{server}}…', {
          name: targetName,
          server
        })
      : translate('codezera.sftp.downloading', 'Downloading {{name}} from {{server}}…', {
          name: targetName,
          server
        })
  const toastId = toast.loading(pending)
  try {
    const result = await run()
    const title =
      kind === 'upload'
        ? translate('codezera.sftp.uploaded', 'Uploaded {{count}} file(s) to {{server}}', {
            count: result.files,
            server
          })
        : translate('codezera.sftp.downloaded', 'Downloaded {{count}} file(s) from {{server}}', {
            count: result.files,
            server
          })
    toast.success(title, {
      id: toastId,
      description: transferDescription(
        result,
        kind === 'upload' ? result.remotePath : result.localPath
      )
    })
    return result
  } catch (error) {
    if (error instanceof SftpSudoCancelled) {
      toast.dismiss(toastId)
      return null
    }
    toast.error(
      kind === 'upload'
        ? translate('codezera.sftp.uploadFailed', 'Upload failed')
        : translate('codezera.sftp.downloadFailed', 'Download failed'),
      { id: toastId, description: sftpErrorText(error) }
    )
    return null
  }
}

export function sftpUpload(workspace: SftpWorkspace, localPath: string): Promise<unknown> {
  return runTransfer(
    workspace,
    'upload',
    () =>
      withSudoPassword(workspace.workspacePath, () =>
        window.api.codezera.sftp.upload({ workspacePath: workspace.workspacePath, localPath })
      ),
    fileName(localPath)
  )
}

/** Overwrites the local file or folder with the server copy. */
export function sftpDownloadLocal(workspace: SftpWorkspace, localPath: string): Promise<unknown> {
  return runTransfer(
    workspace,
    'download',
    () =>
      window.api.codezera.sftp.downloadLocal({ workspacePath: workspace.workspacePath, localPath }),
    fileName(localPath)
  )
}

export function sftpDownloadRemote(workspace: SftpWorkspace, remotePath: string): Promise<unknown> {
  return runTransfer(
    workspace,
    'download',
    () =>
      window.api.codezera.sftp.downloadRemote({
        workspacePath: workspace.workspacePath,
        remotePath
      }),
    fileName(remotePath)
  )
}

/** Opens a compare tab: server copy (left, read-only) against the local file (right). */
export function openSftpCompare(workspace: SftpWorkspace, localPath: string): void {
  useAppStore.getState().openFile(
    {
      filePath: `${workspace.worktreeId}${SFTP_COMPARE_PATH_MARKER}${localPath}`,
      relativePath: translate('codezera.sftp.compareTab', '{{name}} ↔ server', {
        name: fileName(localPath)
      }),
      worktreeId: workspace.worktreeId,
      language: 'plaintext',
      mode: 'codezera-panel',
      codezeraPanel: 'sftp-compare',
      runtimeEnvironmentId: null
    },
    { preview: false }
  )
}

/** Local path a compare tab was opened for, recovered from its virtual file path. */
export function sftpCompareLocalPath(virtualPath: string): string | null {
  const index = virtualPath.indexOf(SFTP_COMPARE_PATH_MARKER)
  return index === -1 ? null : virtualPath.slice(index + SFTP_COMPARE_PATH_MARKER.length)
}

export async function openSftpTerminal(workspace: SftpWorkspace): Promise<void> {
  try {
    const command = await window.api.codezera.sftp.sshCommand({
      workspacePath: workspace.workspacePath
    })
    createNewTerminalTab(workspace.worktreeId, undefined, { command })
  } catch (error) {
    toast.error(translate('codezera.sftp.terminalFailed', 'Cannot open SSH terminal'), {
      description: sftpErrorText(error)
    })
  }
}

/**
 * Orca's editor save hook: uploads the saved file when the active profile has uploadOnSave.
 * Takes the save's own write context so it never re-resolves the workspace from the store.
 */
export function onCodezeraFileSaved(filePath: string, context: RuntimeFileOperationArgs): void {
  const workspacePath = context.worktreePath
  if (
    context.target.kind !== 'local' ||
    context.connectionId ||
    !workspacePath ||
    !sftpAvailable() ||
    useSftpStore.getState().states[workspacePath]?.status === 'missing'
  ) {
    return
  }
  // Started on a microtask so nothing here can throw into Orca's save.
  void Promise.resolve()
    .then(() =>
      withSudoPassword(workspacePath, () =>
        window.api.codezera.sftp.uploadOnSave({ workspacePath, localPath: filePath })
      )
    )
    .then((result) => {
      if (result) {
        toast.success(
          translate('codezera.sftp.uploadedOnSave', 'Uploaded {{name}} to {{server}}', {
            name: fileName(filePath),
            server: profileLabel(workspacePath)
          }),
          { description: result.remotePath }
        )
      }
    })
    .catch((error: unknown) => {
      if (error instanceof SftpSudoCancelled) {
        return
      }
      toast.error(translate('codezera.sftp.uploadOnSaveFailed', 'Upload on save failed'), {
        description: sftpErrorText(error)
      })
    })
}
