// Codezera: build (and optionally publish) the fork's desktop app.
// Usage: node config/scripts/codezera-package.mjs <version|mac|win> [--version X] [--publish never|always]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MAX_BUILDS_PER_ORCA_VERSION = 99

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

/** Orca a.b.c, build n → a.b.(c*100+n): plain semver that stays ordered across Orca bumps. */
export function codezeraVersion(orcaVersion, existingTags) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(orcaVersion)
  if (!match) {
    throw new Error(`Orca version is not plain semver: ${orcaVersion}`)
  }
  const [, major, minor, patch] = match
  const base = Number(patch) * 100
  let build = 0
  for (const tag of existingTags) {
    const tagMatch = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag)
    if (!tagMatch || tagMatch[1] !== major || tagMatch[2] !== minor) {
      continue
    }
    const tagPatch = Number(tagMatch[3])
    if (tagPatch > base && tagPatch <= base + MAX_BUILDS_PER_ORCA_VERSION) {
      build = Math.max(build, tagPatch - base)
    }
  }
  if (build >= MAX_BUILDS_PER_ORCA_VERSION) {
    throw new Error(
      `Orca ${orcaVersion} already has ${MAX_BUILDS_PER_ORCA_VERSION} Codezera builds`
    )
  }
  return `${major}.${minor}.${base + build + 1}`
}

function nextVersion() {
  const orcaVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version
  // Origin only: fetched upstream tags (Orca's own v1.5.1…) would look like Codezera builds.
  const tags = git(['ls-remote', '--tags', '--refs', 'origin', 'v*'])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('refs/tags/')[1])
  return codezeraVersion(orcaVersion, tags)
}

/** Skill installs pin to a commit on stablyai/orca, so use the last merged upstream commit. */
function upstreamCommit() {
  return git(['merge-base', 'HEAD', process.env.CODEZERA_UPSTREAM_REF ?? 'upstream/main'])
}

function run(command, args, env) {
  console.log(`[codezera] ${command} ${args.join(' ')}`)
  // shell on Windows resolves pnpm.cmd from PATH.
  execFileSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32'
  })
}

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

function packageApp(platform) {
  const version = readFlag('version', null) ?? nextVersion()
  const publish = readFlag('publish', 'never')
  // Local smoke builds: one arch (`--arch arm64`) and reuse of an existing out/ (`--skip-build`).
  const arch = readFlag('arch', null)
  const skipBuild = process.argv.includes('--skip-build')
  const env = {
    ORCA_BUILD_COMMIT: git(['rev-parse', 'HEAD']),
    ORCA_BUILD_SOURCE_COMMIT: process.env.ORCA_BUILD_SOURCE_COMMIT || upstreamCommit(),
    ORCA_LOCAL_BUILD_VERSION: version,
    ...(arch ? { CODEZERA_MAC_ARCHS: arch } : {})
  }
  console.log(`[codezera] ${platform} ${version} (skills @ ${env.ORCA_BUILD_SOURCE_COMMIT})`)
  // Same sequence as Orca's release-mac-build / dev-channel-win-build workflows.
  if (!skipBuild) {
    run('pnpm', ['run', 'build:release'], env)
  }
  if (platform === 'mac') {
    run(
      'node',
      [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        'config/scripts/pinned-node-downloads.mjs',
        'darwin-arm64',
        'darwin-x64'
      ],
      env
    )
  }
  run('node', ['config/scripts/ensure-native-runtime.mjs', '--runtime=electron'], env)
  run(
    'pnpm',
    [
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.codezera.cjs',
      platform === 'mac' ? '--mac' : '--win',
      ...(arch && platform === 'win' ? [`--${arch}`] : []),
      '--publish',
      publish
    ],
    env
  )
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const command = process.argv[2]
  if (command === 'version') {
    console.log(nextVersion())
  } else if (command === 'upstream-commit') {
    console.log(upstreamCommit())
  } else if (command === 'mac' || command === 'win') {
    packageApp(command)
  } else {
    console.error(
      'Usage: codezera-package.mjs <version|upstream-commit|mac|win> [--version X] [--publish never|always]'
    )
    process.exit(2)
  }
}
