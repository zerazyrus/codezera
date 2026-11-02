import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SFTP_SUDO_PASSWORD_REQUIRED,
  SFTP_SUDO_PASSWORD_WRONG
} from '../../../shared/codezera/sftp-types'
import {
  batchSudoOps,
  buildSudoCommand,
  buildSudoWriteScript,
  classifySudoFailure,
  meaningfulSudoStderr,
  sudoFailureError,
  type SudoWriteOp
} from './sftp-sudo-command'

const AWKWARD_NAMES = [`it's here`, 'two  spaces', '$HOME and $(echo x)', 'back\\slash "q"']

describe('sudo write script', () => {
  it('quotes every path once inside the script and the script once for the login shell', () => {
    const script = buildSudoWriteScript([
      { kind: 'dir', path: "/srv/a'b" },
      { kind: 'file', temp: '/tmp/.codezera-1', path: '/srv/$x y' }
    ])
    expect(script).toContain(`cz_dir '/srv/a'\\''b' || return`)
    expect(script).toContain(`cz_put '/tmp/.codezera-1' '/srv/$x y' || return`)
    expect(script).toContain(`rm -f -- '/tmp/.codezera-1'`)
    const command = buildSudoCommand(script)
    expect(command.startsWith(`LC_ALL=C sudo -S -p '' su root -c '`)).toBe(true)
    // What the login shell hands to `su -c` is exactly the script.
    const decoded = execFileSync(
      '/bin/sh',
      ['-c', `printf %s ${command.slice(command.indexOf(" -c '") + 4)}`],
      {
        encoding: 'utf8'
      }
    )
    expect(decoded).toBe(script)
  })

  it('splits long op lists by script size, keeping order', () => {
    const ops: SudoWriteOp[] = Array.from({ length: 50 }, (_, index) => ({
      kind: 'file',
      temp: `/tmp/.codezera-${index}`,
      path: `/srv/${'x'.repeat(80)}/${index}`
    }))
    const batches = batchSudoOps(ops, 2000)
    expect(batches.length).toBeGreaterThan(1)
    expect(batches.flat()).toEqual(ops)
    expect(batchSudoOps([])).toEqual([])
  })
})

describe.skipIf(process.platform === 'win32')('sudo write command under a fake sudo', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'codezera-sudo-'))
    const bin = join(root, 'bin')
    execFileSync('mkdir', [bin])
    // Checks the stdin password, then runs `su root -c <script>` as a plain shell.
    writeFileSync(
      join(bin, 'sudo'),
      [
        '#!/bin/sh',
        'IFS= read -r password',
        'echo "sudo: unable to resolve host test-box" >&2',
        'if [ "$password" != "s3cret" ]; then echo "Sorry, try again." >&2; echo "sudo: 1 incorrect password attempt" >&2; exit 1; fi',
        'while [ "$1" != "-c" ]; do shift; done',
        'exec sh -c "$2"'
      ].join('\n')
    )
    // BSD chown has no --reference; ownership is not what this test checks.
    writeFileSync(join(bin, 'chown'), '#!/bin/sh\nexit 0\n')
    chmodSync(join(bin, 'sudo'), 0o755)
    chmodSync(join(bin, 'chown'), 0o755)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const run = (ops: SudoWriteOp[], password: string): { status: number; stderr: string } => {
    try {
      execFileSync('/bin/sh', ['-c', buildSudoCommand(buildSudoWriteScript(ops))], {
        input: `${password}\n`,
        env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      return { status: 0, stderr: '' }
    } catch (error) {
      const failure = error as { status: number; stderr: Buffer }
      return { status: failure.status, stderr: failure.stderr.toString() }
    }
  }

  it('writes awkward paths, keeps an existing file mode, creates parents and removes temps', () => {
    const site = join(root, 'site')
    execFileSync('mkdir', [site])
    const existing = join(site, AWKWARD_NAMES[0]!)
    writeFileSync(existing, 'old')
    chmodSync(existing, 0o640)
    const ops: SudoWriteOp[] = AWKWARD_NAMES.map((name, index) => {
      const temp = join(root, `.codezera-${index}`)
      writeFileSync(temp, `content ${index}`)
      return { kind: 'file', temp, path: join(site, index === 0 ? name : `${name}/dir/${name}`) }
    })
    ops.unshift({ kind: 'dir', path: join(site, 'empty $dir') })

    expect(run(ops, 's3cret').status).toBe(0)
    expect(readFileSync(existing, 'utf8')).toBe('content 0')
    expect(statSync(existing).mode & 0o777).toBe(0o640)
    for (const [index, name] of AWKWARD_NAMES.entries()) {
      if (index > 0) {
        const created = join(site, `${name}/dir/${name}`)
        expect(readFileSync(created, 'utf8')).toBe(`content ${index}`)
        expect(statSync(created).mode & 0o777).toBe(0o644)
        expect(statSync(join(site, name)).mode & 0o777).toBe(0o755)
      }
    }
    expect(statSync(join(site, 'empty $dir')).isDirectory()).toBe(true)
    expect(ops.every((op) => op.kind === 'dir' || !existsSync(op.temp))).toBe(true)
    expect(existsSync(join(root, '$HOME'))).toBe(false)
  })

  it('fails with the sudo message on a wrong password and stops at the first failing op', () => {
    const temp = join(root, '.codezera-x')
    writeFileSync(temp, 'x')
    const wrong = run([{ kind: 'file', temp, path: join(root, 'out') }], 'nope')
    expect(wrong.status).not.toBe(0)
    expect(classifySudoFailure(wrong.stderr)).toBe('password-wrong')
    expect(existsSync(join(root, 'out'))).toBe(false)

    writeFileSync(join(root, 'blocker'), 'a file, not a folder')
    const blocked = run(
      [
        { kind: 'file', temp, path: join(root, 'blocker', 'child') },
        { kind: 'dir', path: join(root, 'never') }
      ],
      's3cret'
    )
    expect(blocked.status).not.toBe(0)
    expect(existsSync(join(root, 'never'))).toBe(false)
    expect(existsSync(temp)).toBe(false)
  })
})

describe('sudo failure mapping', () => {
  it('classifies sudo messages and ignores host resolution warnings', () => {
    expect(
      classifySudoFailure('[sudo] Sorry, try again.\nsudo: 1 incorrect password attempt')
    ).toBe('password-wrong')
    expect(classifySudoFailure('sudo: no password was provided')).toBe('password-wrong')
    expect(classifySudoFailure('sudo: a password is required')).toBe('password-required')
    expect(
      classifySudoFailure('dev is not in the sudoers file.  This incident will be reported.')
    ).toBe('not-allowed')
    expect(classifySudoFailure('cat: /srv/x: Is a directory')).toBe('failed')
    expect(
      meaningfulSudoStderr(
        'sudo: unable to resolve host web01: Name or service not known\n\nboom\n'
      )
    ).toBe('boom')
  })

  it('carries a marker only for password problems', () => {
    const wrong = sudoFailureError(1, 'Sorry, try again.', 'dev@web')
    expect(wrong.code).toBe(SFTP_SUDO_PASSWORD_WRONG)
    expect(wrong.message).toBe(`Wrong sudo password for dev@web (${SFTP_SUDO_PASSWORD_WRONG})`)
    expect(sudoFailureError(1, 'sudo: a password is required', 'dev@web').code).toBe(
      SFTP_SUDO_PASSWORD_REQUIRED
    )
    const failed = sudoFailureError(
      1,
      'sudo: unable to resolve host web\nmkdir: Permission denied',
      'dev@web'
    )
    expect(failed.code).toBe(null)
    expect(failed.message).toBe('Upload as root failed (exit 1): mkdir: Permission denied')
  })
})
