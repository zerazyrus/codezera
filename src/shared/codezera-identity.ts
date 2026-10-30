// Codezera fork identity. Vitest defines CODEZERA_UPSTREAM_IDENTITY so Orca's own tests keep
// asserting Orca's identity and upstream test files merge without edits.
declare const CODEZERA_UPSTREAM_IDENTITY: boolean | undefined

// typeof: without the define the identifier is undeclared, and a direct comparison would throw.
// oxlint-disable-next-line unicorn/no-typeof-undefined
const upstream = typeof CODEZERA_UPSTREAM_IDENTITY !== 'undefined' && CODEZERA_UPSTREAM_IDENTITY

/** GitHub owner/repo that publishes this app's builds and updater manifests. */
export const APP_RELEASE_REPO = upstream ? 'stablyai/orca' : 'zerazyrus/codezera'
/** APP_RELEASE_REPO escaped for RegExp sources. */
export const APP_RELEASE_REPO_PATTERN = APP_RELEASE_REPO.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
export const PACKAGED_APP_NAME = upstream ? 'Orca' : 'Codezera'
export const PACKAGED_APP_USER_MODEL_ID = upstream ? 'com.stablyai.orca' : 'net.thezera.codezera'
