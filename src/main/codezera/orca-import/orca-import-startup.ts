import {
  acquireProfileStateRuntimeAdmission,
  type ProfileStateRuntimeAdmission
} from '../../persistence/profile-state/profile-state-access'
import { applyStagedOrcaImport } from './orca-profile-import'

/**
 * Codezera replacement for Orca's profile-state admission in main-process preflight. That call runs
 * after both profile locks and before any profile file opens, the one safe point to swap state in.
 */
export function admitProfileStateAfterOrcaImport(
  userDataPath: string
): ProfileStateRuntimeAdmission {
  try {
    const backupDir = applyStagedOrcaImport(userDataPath)
    if (backupDir) {
      console.log(`[codezera] Imported Orca profile; previous state kept in ${backupDir}`)
    }
  } catch (error) {
    console.error('[codezera] Failed to apply staged Orca import:', error)
  }
  return acquireProfileStateRuntimeAdmission(userDataPath)
}
