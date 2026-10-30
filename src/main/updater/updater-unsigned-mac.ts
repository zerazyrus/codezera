import { app } from 'electron'
import { recordUpdaterLifecycle } from '../updater-lifecycle-diagnostics'
import { armUpdateInstallExitWatchdog } from '../update-install-exit-watchdog'
import { UpdaterDownloadInstall } from './updater-download-install'
import { releaseSessionsForInstaller } from './updater-installer-session-release'
import {
  canReplaceBundle,
  downloadUnsignedMacUpdate,
  getRunningAppBundlePath,
  isUnsignedMacApp,
  launchUnsignedMacSwap
} from './codezera-unsigned-mac-update'

/** Codezera: routes download/install through a self-managed bundle swap on unsigned macOS builds. */
export abstract class UpdaterUnsignedMac extends UpdaterDownloadInstall {
  private unsignedMacDownload: Promise<void> | null = null
  private unsignedMacStaged: { version: string; appPath: string } | null = null

  protected downloadUpdate(): void {
    if (!isUnsignedMacApp()) {
      super.downloadUpdate()
      return
    }
    if (this.unsignedMacDownload || this.quitAndInstallInProgress) {
      return
    }
    const version =
      this.currentStatus.state === 'available'
        ? this.currentStatus.version
        : this.currentStatus.state === 'error' && this.hasInstallableDownloadedVersion()
          ? this.availableVersion
          : null
    if (!version) {
      return
    }
    this.unsignedMacDownload = this.runUnsignedMacDownload(version).finally(() => {
      this.unsignedMacDownload = null
    })
  }

  private async runUnsignedMacDownload(version: string): Promise<void> {
    recordUpdaterLifecycle('codezera_unsigned_mac_download_started', { version })
    this.sendStatus({ state: 'downloading', percent: 0, version })
    try {
      const appPath = await downloadUnsignedMacUpdate(version, (percent) =>
        this.sendStatus({ state: 'downloading', percent, version })
      )
      this.unsignedMacStaged = { version, appPath }
      this.sendStatus({ state: 'downloaded', version })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      recordUpdaterLifecycle(
        'codezera_unsigned_mac_download_failed',
        { version },
        { level: 'warn', message }
      )
      this.sendErrorStatus(`Could not download Codezera ${version}: ${message}`)
    }
  }

  protected quitAndInstall(): void {
    if (!isUnsignedMacApp()) {
      super.quitAndInstall()
      return
    }
    void this.runUnsignedMacInstall()
  }

  private async runUnsignedMacInstall(): Promise<void> {
    const staged = this.unsignedMacStaged
    if (!staged || this.quitAndInstallInProgress) {
      this.sendToMainWindow('updater:quitAndInstallAborted')
      return
    }
    const target = getRunningAppBundlePath()
    if (!(await canReplaceBundle(target))) {
      this.sendToMainWindow('updater:quitAndInstallAborted')
      this.sendInstallFailureStatus({
        state: 'error',
        message: `Codezera cannot replace itself in ${target}. Download ${staged.version} from thezera.net and install it manually.`,
        version: staged.version
      })
      return
    }
    this.finishActiveUpdateCheckAttempt()
    this.clearBackgroundCheckLaunchPending()
    this.quitAndInstallInProgress = true
    // Blocks dock re-activation of the old bundle while the swap runs.
    this.quittingForUpdate = true
    this.sendStatus(
      { state: 'downloaded', version: staged.version, installing: true },
      { force: true }
    )
    try {
      await this.runBeforeUpdateQuitCleanup()
      await launchUnsignedMacSwap(staged.appPath, target)
    } catch (error) {
      this.resetQuitForUpdateState()
      this.sendToMainWindow('updater:quitAndInstallAborted')
      this.sendInstallFailureStatus({
        state: 'error',
        message: this.withInstallFailureCause('Could not start the update.', error),
        version: staged.version
      })
      return
    }
    recordUpdaterLifecycle('codezera_unsigned_mac_swap_launched', { version: staged.version })
    // The swap script now waits for this process; mirror the native path's commit + exit watchdog.
    this.updateInstallCommitted = true
    armUpdateInstallExitWatchdog()
    releaseSessionsForInstaller()
    app.quit()
  }
}
