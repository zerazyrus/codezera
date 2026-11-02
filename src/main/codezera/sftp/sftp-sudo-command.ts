import { quotePosixShell } from '../../../shared/shell-argument-quoting'
import {
  SFTP_SUDO_PASSWORD_REQUIRED,
  SFTP_SUDO_PASSWORD_WRONG
} from '../../../shared/codezera/sftp-types'

/** One root write: create a folder, or move an uploaded temp file's content to `path`. */
export type SudoWriteOp =
  | { kind: 'dir'; path: string }
  | { kind: 'file'; temp: string; path: string }

// New folders and files take owner:group from their parent, like a root `sudo su` user expects
// of files they create by hand; existing files are overwritten in place to keep owner and mode.
const SCRIPT_HELPERS = [
  'cz_dir() { [ -d "$1" ] && return 0; cz_dir "$(dirname "$1")" || return; mkdir "$1" && chown --reference="$(dirname "$1")" "$1" && chmod 755 "$1"; }',
  'cz_put() { if [ -e "$2" ]; then cat "$1" > "$2"; else cz_dir "$(dirname "$2")" && cat "$1" > "$2" && chown --reference="$(dirname "$2")" "$2" && chmod 644 "$2"; fi; }'
]

function opLine(op: SudoWriteOp): string {
  return op.kind === 'dir'
    ? `cz_dir ${quotePosixShell(op.path)} || return`
    : `cz_put ${quotePosixShell(op.temp)} ${quotePosixShell(op.path)} || return`
}

/** Shell script run as root: applies `ops` in order, stops at the first failure, always removes the temps. */
export function buildSudoWriteScript(ops: readonly SudoWriteOp[]): string {
  const temps = ops.flatMap((op) => (op.kind === 'file' ? [quotePosixShell(op.temp)] : []))
  return [
    ...SCRIPT_HELPERS,
    'cz_ops() {',
    ...ops.map(opLine),
    '}',
    'cz_ops; rc=$?',
    ...(temps.length > 0 ? [`rm -f -- ${temps.join(' ')}`] : []),
    'exit $rc'
  ].join('\n')
}

/**
 * The exec command: the login user's sudo reads its password from stdin (`-S`, no prompt), then
 * `su root` runs the script, which works when sudoers allows everything or only `su`.
 * The script is quoted once more for the login shell, so its own quoting reaches `su -c` intact.
 */
export function buildSudoCommand(script: string): string {
  return `LC_ALL=C sudo -S -p '' su root -c ${quotePosixShell(script)}`
}

/** Bytes of script text one exec may carry; Linux caps a single argument at 128 KiB. */
export const MAX_SUDO_SCRIPT_BYTES = 48 * 1024

/** Splits ops into scripts that stay under `maxBytes` each, keeping order. */
export function batchSudoOps<T extends SudoWriteOp>(
  ops: readonly T[],
  maxBytes = MAX_SUDO_SCRIPT_BYTES
): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  let size = 0
  for (const op of ops) {
    // Measured after the outer quoting, which grows each `'` to four bytes; temps recur in `rm`.
    const lineBytes =
      Buffer.byteLength(quotePosixShell(opLine(op))) + (op.kind === 'file' ? op.temp.length + 1 : 0)
    if (current.length > 0 && size + lineBytes > maxBytes) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(op)
    size += lineBytes
  }
  if (current.length > 0) {
    batches.push(current)
  }
  return batches
}

export type SudoFailureKind = 'password-wrong' | 'password-required' | 'not-allowed' | 'failed'

export function classifySudoFailure(stderr: string): SudoFailureKind {
  if (/incorrect password|Sorry, try again|no password was provided/i.test(stderr)) {
    return 'password-wrong'
  }
  if (/a password is required/i.test(stderr)) {
    return 'password-required'
  }
  if (/is not in the sudoers file|is not allowed to execute|may not run sudo/i.test(stderr)) {
    return 'not-allowed'
  }
  return 'failed'
}

/** Stderr without sudo's harmless noise, e.g. `sudo: unable to resolve host web01`. */
export function meaningfulSudoStderr(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/unable to resolve host/i.test(line))
    .join('\n')
}

/** A failed root write; `code` is set when the renderer must ask for the sudo password. */
export class SftpSudoError extends Error {
  constructor(
    message: string,
    readonly code: typeof SFTP_SUDO_PASSWORD_REQUIRED | typeof SFTP_SUDO_PASSWORD_WRONG | null
  ) {
    // The marker survives Electron's IPC, which keeps only the message of a rejection.
    super(code ? `${message} (${code})` : message)
    this.name = 'SftpSudoError'
  }
}

export function sudoPasswordRequiredError(account: string): SftpSudoError {
  return new SftpSudoError(`Sudo password needed for ${account}`, SFTP_SUDO_PASSWORD_REQUIRED)
}

/** Maps a non-zero exit of the sudo command to a typed error. */
export function sudoFailureError(
  exitCode: number | null,
  stderr: string,
  account: string
): SftpSudoError {
  const kind = classifySudoFailure(stderr)
  if (kind === 'password-wrong') {
    return new SftpSudoError(`Wrong sudo password for ${account}`, SFTP_SUDO_PASSWORD_WRONG)
  }
  if (kind === 'password-required') {
    return sudoPasswordRequiredError(account)
  }
  if (kind === 'not-allowed') {
    return new SftpSudoError(`${account} is not allowed to run "sudo su" on the server`, null)
  }
  const detail = meaningfulSudoStderr(stderr)
  return new SftpSudoError(
    `Upload as root failed (exit ${exitCode ?? 'signal'})${detail ? `: ${detail}` : ''}`,
    null
  )
}
