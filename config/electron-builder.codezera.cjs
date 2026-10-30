// Codezera packaging overlay: keeps Orca's config untouched so upstream merges never conflict here.
const base = require('./electron-builder.config.cjs')

const { publisherName: _signPathPublisher, ...unsignedSigntoolOptions } =
  base.win.signtoolOptions ?? {}

// Local smoke builds pass one arch; CI ships both.
const macArchs = process.env.CODEZERA_MAC_ARCHS?.split(',') ?? ['x64', 'arm64']

module.exports = {
  ...base,
  appId: 'net.thezera.codezera',
  productName: 'Codezera',
  // `name` drives the packaged userData dir (~/Library/Application Support/codezera), separate from Orca's.
  extraMetadata: { ...base.extraMetadata, name: 'codezera' },
  win: {
    ...base.win,
    executableName: 'Codezera',
    // Unsigned installers: a baked publisherName would make the updater reject every Codezera update.
    signtoolOptions: unsignedSigntoolOptions,
    verifyUpdateCodeSignature: false
  },
  nsis: { ...base.nsis, artifactName: 'codezera-windows-setup.${ext}' },
  mac: {
    ...base.mac,
    // Applies to the zip; dmg keeps its own artifactName below.
    artifactName: 'codezera-macos-${arch}.${ext}',
    target: [
      { target: 'dmg', arch: macArchs },
      { target: 'zip', arch: macArchs }
    ]
  },
  dmg: { ...base.dmg, artifactName: 'codezera-macos-${arch}.${ext}' },
  publish: {
    provider: 'github',
    owner: 'zerazyrus',
    repo: 'codezera',
    // The release workflow uploads mac + win into one draft, then publishes it once both legs pass.
    releaseType: 'draft'
  }
}
