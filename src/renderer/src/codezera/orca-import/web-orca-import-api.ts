import type { OrcaImportApi } from '../../../../shared/codezera/orca-import-types'

/**
 * Web client answer: importing reads the desktop host's Orca profile and relaunches the app,
 * so it only exists in the desktop shell. Without this, the generic web fallback resolves
 * `undefined` and the Settings row crashes reading `probe.available`.
 */
export function createWebOrcaImportApi(): OrcaImportApi {
  return {
    probe: () => Promise.resolve({ available: false }),
    run: () => Promise.resolve({ status: 'cancelled' })
  }
}
