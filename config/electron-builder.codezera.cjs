// Codezera packaging overlay: keeps Orca's config untouched so upstream merges never conflict here.
const base = require('./electron-builder.config.cjs')

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
