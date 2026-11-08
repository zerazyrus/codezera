import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { z } from 'zod'
import type { CkitToolUpdate, CkitToolUpdateResult } from '../../../shared/codezera/ckit-types'
import { getCkitBinaryPath } from './ckit-quota'

const CHECK_TIMEOUT_MS = 30_000
const UPDATE_TIMEOUT_MS = 10 * 60_000
const CKIT_LATEST_RELEASE = 'https://api.github.com/repos/dante241/ckit_agent/releases/latest'
const VERSION = /(\d+(?:\.\d+)+)/

// ckit setup installs omp with curl on macOS/Linux and with `bun add -g` on Windows.
function findOmpBinary(): string | undefined {
  const exe = process.platform === 'win32' ? 'omp.exe' : 'omp'
  return [join(homedir(), '.local', 'bin', exe), join(homedir(), '.bun', 'bin', exe)].find((p) =>
    existsSync(p)
  )
}

// Electron's PATH often lacks the installer dirs; `ckit up` needs curl and `omp update` may need bun.
function toolEnv(): NodeJS.ProcessEnv {
  const dirs = [join(homedir(), '.local', 'bin'), join(homedir(), '.bun', 'bin')]
  return { ...process.env, PATH: [...dirs, process.env.PATH ?? ''].join(delimiter) }
}

function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) {
      return (a[i] ?? 0) > (b[i] ?? 0)
    }
  }
  return false
}

async function checkCkit(): Promise<CkitToolUpdate | null> {
  const bin = getCkitBinaryPath()
  if (!existsSync(bin)) {
    return null
  }
  const [installed, release] = await Promise.all([
    runProcess({ program: bin, args: ['--version'], timeoutMs: CHECK_TIMEOUT_MS }),
    fetch(CKIT_LATEST_RELEASE, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'codezera' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    })
  ])
  const current = VERSION.exec(installed.stdout)?.[1]
  if (!release.ok || !current) {
    await release.body?.cancel()
    return null
  }
  const latest = VERSION.exec(
    z.object({ tag_name: z.string() }).parse(await release.json()).tag_name
  )?.[1]
  return latest && isNewer(latest, current) ? { tool: 'ckit', current, latest } : null
}

// `omp update --check` follows the user's channel (stable/canary), which a registry lookup would not.
async function checkOmp(): Promise<CkitToolUpdate | null> {
  const bin = findOmpBinary()
  if (!bin) {
    return null
  }
  const result = await runProcess({
    program: bin,
    args: ['update', '--check'],
    env: toolEnv(),
    timeoutMs: CHECK_TIMEOUT_MS
  })
  const current = /Current version:\s*(\S+)/.exec(result.stdout)?.[1]
  const latest = /New version available:\s*(\S+)/.exec(result.stdout)?.[1]
  return current && latest ? { tool: 'omp', current, latest } : null
}

export async function checkCkitToolUpdates(): Promise<CkitToolUpdate[]> {
  // Offline or a changed CLI just means no notice.
  const results = await Promise.allSettled([checkCkit(), checkOmp()])
  return results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
}

export async function runCkitToolUpdates(rawTools: unknown): Promise<CkitToolUpdateResult> {
  const tools = z.array(z.enum(['ckit', 'omp'])).parse(rawTools)
  // ckit first: `ckit up` also reapplies its bundled omp files before omp itself moves.
  for (const tool of (['ckit', 'omp'] as const).filter((t) => tools.includes(t))) {
    const program = tool === 'ckit' ? getCkitBinaryPath() : findOmpBinary()
    if (!program || !existsSync(program)) {
      return { ok: false, tool, output: `${tool} is not installed.` }
    }
    const result = await runProcess(
      {
        program,
        args: tool === 'ckit' ? ['up'] : ['update'],
        env: toolEnv(),
        timeoutMs: UPDATE_TIMEOUT_MS
      },
      'tail'
    )
    if (result.code !== 0) {
      const output = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-12).join('\n')
      return { ok: false, tool, output: result.timedOut ? `${output}\n(timed out)` : output }
    }
  }
  return { ok: true }
}
