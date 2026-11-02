import { randomBytes } from 'node:crypto'
import type { Client } from 'ssh2'
import { SFTP_SUDO_PASSWORD_WRONG } from '../../../shared/codezera/sftp-types'
import type { SftpConnection } from './sftp-connection-pool'
import {
  batchSudoOps,
  buildSudoCommand,
  buildSudoWriteScript,
  SftpSudoError,
  sudoFailureError,
  sudoPasswordRequiredError
} from './sftp-sudo-command'
import { call, runPool, type TransferCounts, type UploadPlan } from './sftp-transfers'

type RootWriteOp =
  | { kind: 'dir'; path: string }
  | { kind: 'file'; temp: string; path: string; local: string; size: number }

/** Runs `command`, writes `stdin` and closes it; stdout is discarded. */
function execWithStdin(
  client: Client,
  command: string,
  stdin: string
): Promise<{ exitCode: number | null; stderr: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{
    exitCode: number | null
    stderr: string
  }>()
  client.exec(command, (error, stream) => {
    if (error) {
      reject(error)
      return
    }
    let stderr = ''
    stream.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    stream.on('data', () => {})
    stream.on('close', (code: number | null | undefined) =>
      resolve({ exitCode: code ?? null, stderr })
    )
    stream.end(stdin)
  })
  return promise
}

/**
 * Uploads a plan as root: each file goes to a private temp in /tmp as the login user, then one
 * `sudo su root` exec per batch moves the content into place (see buildSudoWriteScript).
 * The password only travels on the exec's stdin.
 */
export async function uploadPlanAsRoot(
  { client, sftp }: SftpConnection,
  plan: UploadPlan,
  password: string,
  account: string
): Promise<TransferCounts> {
  const counts: TransferCounts = { files: 0, directories: 0, ignored: plan.ignored, bytes: 0 }
  const ops: RootWriteOp[] = [
    ...plan.directories.map((path): RootWriteOp => ({ kind: 'dir', path })),
    ...plan.files.map((file): RootWriteOp => ({
      kind: 'file',
      temp: `/tmp/.codezera-${randomBytes(12).toString('hex')}`,
      path: file.remote,
      local: file.local,
      size: file.size
    }))
  ]
  for (const batch of batchSudoOps(ops)) {
    const files = batch.flatMap((op) => (op.kind === 'file' ? [op] : []))
    const temps = files.map((file) => file.temp)
    try {
      await runPool(files, (file) =>
        call<void>((callback) => sftp.fastPut(file.local, file.temp, { mode: 0o600 }, callback))
      )
      const { exitCode, stderr } = await execWithStdin(
        client,
        buildSudoCommand(buildSudoWriteScript(batch)),
        `${password}\n`
      )
      if (exitCode !== 0) {
        throw sudoFailureError(exitCode, stderr, account)
      }
    } catch (error) {
      // The script removes its temps itself; this covers sudo refusing before the script ran.
      await Promise.all(
        temps.map((temp) => call<void>((callback) => sftp.unlink(temp, callback)).catch(() => {}))
      )
      throw error
    }
    for (const op of batch) {
      if (op.kind === 'dir') {
        counts.directories++
      } else {
        counts.files++
        counts.bytes += op.size
      }
    }
  }
  return counts
}

/** Sudo passwords by SSH host id, in main-process memory only: dropped when wrong and on quit. */
export class SftpSudoPasswords {
  private readonly byTarget = new Map<string, string>()

  set(sshTargetId: string, password: string): void {
    if (!password || /[\r\n]/.test(password)) {
      throw new Error('Enter the sudo password on one line')
    }
    this.byTarget.set(sshTargetId, password)
  }

  clear(): void {
    this.byTarget.clear()
  }

  /**
   * Uploads as root; rejects with a password marker when none is stored or it was wrong.
   * `endpointLabel` is `user@host:port`; messages name the login without the port.
   */
  async upload(
    connection: SftpConnection,
    plan: UploadPlan,
    sshTargetId: string,
    endpointLabel: string
  ): Promise<TransferCounts> {
    const account = endpointLabel.replace(/:\d+$/, '')
    const password = this.byTarget.get(sshTargetId)
    if (password === undefined) {
      throw sudoPasswordRequiredError(account)
    }
    try {
      return await uploadPlanAsRoot(connection, plan, password, account)
    } catch (error) {
      if (error instanceof SftpSudoError && error.code === SFTP_SUDO_PASSWORD_WRONG) {
        this.byTarget.delete(sshTargetId)
      }
      throw error
    }
  }
}
