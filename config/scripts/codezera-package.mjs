// Codezera: build (and optionally publish) the fork's desktop app, and write its release notes.
// Usage: node config/scripts/codezera-package.mjs <version|upstream-commit|notes|mac|win> [--version X] [--publish never|always]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MAX_BUILDS_PER_ORCA_VERSION = 99
const MAX_LISTED_ORCA_CHANGES = 400

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

function originReleaseTags() {
  // Origin only: fetched upstream tags (Orca's own v1.5.1…) would look like Codezera builds.
  return git(['ls-remote', '--tags', '--refs', 'origin', 'v*'])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('refs/tags/')[1])
}

function nextVersion() {
  const orcaVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version
  return codezeraVersion(orcaVersion, originReleaseTags())
}

const UPSTREAM_REF = process.env.CODEZERA_UPSTREAM_REF ?? 'upstream/main'

/** Skill installs pin to a commit on stablyai/orca, so use the last merged upstream commit. */
function upstreamCommit(ref = 'HEAD') {
  return git(['merge-base', ref, UPSTREAM_REF])
}

function subjects(range) {
  return git(['log', '--no-merges', '--format=%s', ...range])
    .split('\n')
    .filter(Boolean)
}

/** "fix: x (#123)" → markdown linking the upstream PR. */
function linkOrcaPr(subject) {
  return subject.replace(/\(#(\d+)\)$/, '([#$1](https://github.com/stablyai/orca/pull/$1))')
}

/** Notes = commit subjects since the previous release: Codezera's own first, then Orca's merged ones. */
function releaseNotes() {
  const previous = originReleaseTags()
    .sort(new Intl.Collator('en', { numeric: true }).compare)
    .at(-1)
  if (previous) {
    git(['fetch', '--quiet', '--no-tags', 'origin', `refs/tags/${previous}:refs/tags/${previous}`])
  }
  const upstreamNow = upstreamCommit()
  const upstreamBefore = previous ? upstreamCommit(previous) : null
  const own = subjects([previous ? `${previous}..HEAD` : 'HEAD', `^${UPSTREAM_REF}`])
  const orca = upstreamBefore ? subjects([`${upstreamBefore}..${upstreamNow}`]) : []
  const short = (sha) => sha.slice(0, 10)

  const lines = ['## Codezera', '']
  lines.push(...(own.length ? own.map((s) => `- ${s}`) : ['- Không có thay đổi riêng.']), '')
  lines.push('## Orca', '')
  if (!upstreamBefore) {
    lines.push(
      `Dựa trên Orca [\`${short(upstreamNow)}\`](https://github.com/stablyai/orca/commit/${upstreamNow}).`
    )
  } else if (orca.length === 0) {
    lines.push('Không có cập nhật mới từ Orca.')
  } else {
    lines.push(
      `${orca.length} thay đổi từ Orca ([so sánh](https://github.com/stablyai/orca/compare/${short(upstreamBefore)}...${short(upstreamNow)})).`,
      '',
      '<details><summary>Danh sách</summary>',
      '',
      // GitHub caps release bodies at 125k chars; the compare link covers the rest.
      ...orca.slice(0, MAX_LISTED_ORCA_CHANGES).map((s) => `- ${linkOrcaPr(s)}`),
      ...(orca.length > MAX_LISTED_ORCA_CHANGES
        ? [`- … và ${orca.length - MAX_LISTED_ORCA_CHANGES} thay đổi khác (xem so sánh)`]
        : []),
      '',
      '</details>'
    )
  }
  lines.push(
    '',
    '## Cài đặt',
    '',
    '**macOS (chưa ký):** kéo Codezera vào Applications rồi chạy một lần `xattr -cr /Applications/Codezera.app`. Các bản sau cập nhật ngay trong app.',
    '',
    '**Windows:** SmartScreen cảnh báo thì bấm *More info → Run anyway*.'
  )
  return lines.join('\n')
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
  } else if (command === 'notes') {
    console.log(releaseNotes())
  } else if (command === 'mac' || command === 'win') {
    packageApp(command)
  } else {
    console.error(
      'Usage: codezera-package.mjs <version|upstream-commit|notes|mac|win> [--version X] [--publish never|always]'
    )
    process.exit(2)
  }
}
