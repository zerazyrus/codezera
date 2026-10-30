// Codezera: unsigned macOS builds cannot use Squirrel.Mac, which requires the new bundle to match a
// Developer ID signature. Download the release zip ourselves (no browser quarantine flag), then swap
// the bundle from a detached script after this process exits.
import { app, net } from 'electron'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, createWriteStream } from 'node:fs'
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parse } from 'yaml'
import { APP_RELEASE_REPO } from '../../shared/codezera-identity'

const RELEASE_DOWNLOAD_BASE = `https://github.com/${APP_RELEASE_REPO}/releases/download`
const SWAP_WAIT_FOR_EXIT_SECONDS = 120

let unsignedMacApp: boolean | null = null

/** Packaged macOS build without a Developer ID team (ad-hoc or unsigned). */
export function isUnsignedMacApp(): boolean {
  if (unsignedMacApp === null) {
    unsignedMacApp = false
    const bundlePath = getRunningAppBundlePath()
    if (process.platform === 'darwin' && app.isPackaged && bundlePath.endsWith('.app')) {
      // codesign prints details on stderr; an unsigned bundle exits 1 with no TeamIdentifier.
      const result = spawnSync('codesign', ['--display', '--verbose=2', bundlePath], {
        encoding: 'utf8'
      })
      unsignedMacApp = !/^TeamIdentifier=(?!not set)\S+/m.test(`${result.stderr}${result.stdout}`)
    }
  }
  return unsignedMacApp
}

/** <bundle>.app/Contents/MacOS/<exe> → <bundle>.app */
export function getRunningAppBundlePath(): string {
  return resolve(process.execPath, '..', '..', '..')
}

type ManifestFile = { url?: unknown; sha512?: unknown; size?: unknown }

/** Pick this architecture's zip from latest-mac.yml (codezera-macos-<arch>.zip). */
export function selectMacZip(
  manifestText: string,
  arch: string
): { url: string; sha512: string; size: number | null } {
  const manifest = parse(manifestText) as { files?: ManifestFile[] } | null
  const file = (manifest?.files ?? []).find(
    (entry) => typeof entry.url === 'string' && entry.url.endsWith(`-${arch}.zip`)
  )
  if (!file || typeof file.url !== 'string' || typeof file.sha512 !== 'string') {
    throw new Error(`The release has no macOS ${arch} zip`)
  }
  return {
    url: file.url,
    sha512: file.sha512,
    size: typeof file.size === 'number' ? file.size : null
  }
}

async function fetchOk(url: string): Promise<Response> {
  const response = await net.fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  return response
}

/** Download + verify + extract; resolves to the staged .app path. */
export async function downloadUnsignedMacUpdate(
  version: string,
  onProgress: (percent: number) => void
): Promise<string> {
  const releaseBase = `${RELEASE_DOWNLOAD_BASE}/v${encodeURIComponent(version)}`
  const manifest = await (await fetchOk(`${releaseBase}/latest-mac.yml`)).text()
  const zip = selectMacZip(manifest, process.arch)

  const stagingDir = join(app.getPath('temp'), `codezera-update-${version}`)
  await rm(stagingDir, { recursive: true, force: true })
  await mkdir(stagingDir, { recursive: true })
  const zipPath = join(stagingDir, 'update.zip')

  const response = await fetchOk(`${releaseBase}/${encodeURIComponent(zip.url)}`)
  if (!response.body) {
    throw new Error('Empty download response')
  }
  const total = zip.size ?? Number(response.headers.get('content-length') ?? 0)
  const hash = createHash('sha512')
  let received = 0
  let lastPercent = -1
  const body = Readable.fromWeb(response.body as never)
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk)
    received += chunk.length
    const percent = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : 0
    if (percent !== lastPercent) {
      lastPercent = percent
      onProgress(percent)
    }
  })
  await pipeline(body, createWriteStream(zipPath))
  if (hash.digest('base64') !== zip.sha512) {
    throw new Error('Downloaded update failed its sha512 check')
  }

  const extractDir = join(stagingDir, 'app')
  // ditto preserves the bundle's symlinks, modes and ad-hoc signatures.
  execFileSync('ditto', ['-x', '-k', zipPath, extractDir])
  await rm(zipPath, { force: true })
  const bundle = (await readdir(extractDir)).find((name) => name.endsWith('.app'))
  if (!bundle) {
    throw new Error('The update zip contains no .app bundle')
  }
  onProgress(100)
  return join(extractDir, bundle)
}

/** The swap renames the bundle inside its parent folder, so that folder must be writable. */
export async function canReplaceBundle(bundlePath: string): Promise<boolean> {
  try {
    await access(dirname(bundlePath), constants.W_OK)
    return true
  } catch {
    return false
  }
}

const SWAP_SCRIPT = `#!/bin/bash
set -u
pid="$1"; staged="$2"; target="$3"
for _ in $(seq 1 ${SWAP_WAIT_FOR_EXIT_SECONDS * 5}); do
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.2
done
if kill -0 "$pid" 2>/dev/null; then exit 1; fi
backup="\${target%.app}.previous-$$.app"
if mv "$target" "$backup"; then
  if mv "$staged" "$target"; then
    rm -rf "$backup"
  else
    mv "$backup" "$target"
  fi
fi
xattr -dr com.apple.quarantine "$target" 2>/dev/null
open "$target"
`

/** Detached: waits for this PID to exit, swaps bundles (restoring the old one on failure), relaunches. */
export async function launchUnsignedMacSwap(stagedApp: string, targetApp: string): Promise<void> {
  const scriptPath = join(app.getPath('temp'), `codezera-update-swap-${process.pid}.sh`)
  await writeFile(scriptPath, SWAP_SCRIPT, { mode: 0o755 })
  const child = spawn('/bin/bash', [scriptPath, String(process.pid), stagedApp, targetApp], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}
