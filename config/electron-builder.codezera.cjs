// Codezera packaging overlay: keeps Orca's config untouched so upstream merges never conflict here.
const { copyFileSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const base = require('./electron-builder.config.cjs')

// Orca's mac shim hardcodes `MacOS/Orca`, but the executable is named after productName.
function writeMacCliShims(context) {
  const appName = context.packager.appInfo.productFilename
  const binDir = join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources', 'bin')
  const shim = join(binDir, 'orca')
  const source = readFileSync(shim, 'utf8')
  const orcaLine = 'ELECTRON="$CONTENTS/MacOS/Orca"'
  if (!source.includes(orcaLine)) {
    throw new Error(`Codezera: ${shim} no longer contains ${orcaLine}; update writeMacCliShims`)
  }
  writeFileSync(shim, source.replace(orcaLine, `ELECTRON="$CONTENTS/MacOS/${appName}"`))
  copyFileSync(shim, join(binDir, 'codezera'))
}

// `codezera` is the product's own command, so it never collides with Orca's `orca` on PATH.
function writeLinuxCliShim(context) {
  const binDir = join(context.appOutDir, 'resources', 'bin')
  copyFileSync(join(binDir, 'orca-ide'), join(binDir, 'codezera'))
}

const { publisherName: _signPathPublisher, ...unsignedSigntoolOptions } =
  base.win.signtoolOptions ?? {}

// Local smoke builds pass one arch; CI ships both.
const macArchs = process.env.CODEZERA_MAC_ARCHS?.split(',') ?? ['x64', 'arm64']
// Local review builds (`codezera-package.mjs --review`) install beside the release app, never over it.
// The runtime reads `codezeraFlavor` to pick its own app name, userData and single-instance lock.
const review = process.env.CODEZERA_FLAVOR === 'review'
const productName = review ? 'Codezera Review' : 'Codezera'
const artifactBase = review ? 'codezera-review' : 'codezera'

module.exports = {
  ...base,
  appId: review ? 'net.thezera.codezera.review' : 'net.thezera.codezera',
  afterPack: async (context) => {
    await base.afterPack(context)
    if (context.electronPlatformName === 'darwin') {
      writeMacCliShims(context)
    } else if (context.electronPlatformName === 'linux') {
      writeLinuxCliShim(context)
    }
  },
  productName,
  extraMetadata: {
    ...base.extraMetadata,
    name: artifactBase,
    ...(review ? { codezeraFlavor: 'review' } : {})
  },
  win: {
    ...base.win,
    executableName: productName.replace(' ', ''),
    // Unsigned installers: a baked publisherName would make the updater reject every Codezera update.
    signtoolOptions: unsignedSigntoolOptions,
    verifyUpdateCodeSignature: false
  },
  nsis: { ...base.nsis, artifactName: `${artifactBase}-windows-setup.\${ext}` },
  mac: {
    ...base.mac,
    // Applies to the zip; dmg keeps its own artifactName below.
    artifactName: `${artifactBase}-macos-\${arch}.\${ext}`,
    target: [
      { target: 'dmg', arch: macArchs },
      { target: 'zip', arch: macArchs }
    ]
  },
  dmg: { ...base.dmg, artifactName: `${artifactBase}-macos-\${arch}.\${ext}` },
  publish: {
    provider: 'github',
    owner: 'zerazyrus',
    repo: 'codezera',
    // The release workflow uploads mac + win into one draft, then publishes it once both legs pass.
    releaseType: 'draft'
  }
}
