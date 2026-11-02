import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { sftpErrorText } from './sftp-actions'
import type {
  SftpVsCodeImportAllResult,
  SftpVsCodeImportResult
} from '../../../../shared/codezera/sftp-types'

// Summaries join one fact per line.
const MULTILINE = { classNames: { description: 'whitespace-pre-line' } }

function folderName(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path
}

/** Summary lines shared by the per-workspace and the import-all toasts. */
function hostLines(results: readonly SftpVsCodeImportResult[]): string[] {
  const created = [...new Set(results.flatMap((result) => result.hostsCreated))]
  const reused = [...new Set(results.flatMap((result) => result.hostsReused))]
  const credentials = [...new Set(results.flatMap((result) => result.hostsNeedingCredentials))]
  const lines: string[] = []
  if (created.length > 0) {
    lines.push(
      translate('codezera.sftp.importHostsCreated', 'New SSH hosts: {{hosts}}', {
        hosts: created.join(', ')
      })
    )
  }
  if (reused.length > 0) {
    lines.push(
      translate('codezera.sftp.importHostsReused', 'Existing SSH hosts used: {{hosts}}', {
        hosts: reused.join(', ')
      })
    )
  }
  if (credentials.length > 0) {
    lines.push(
      translate(
        'codezera.sftp.importNeedsCredentials',
        'Passwords were not copied. Set a key or password for {{hosts}} in Settings › SSH Hosts.',
        { hosts: credentials.join(', ') }
      )
    )
  }
  return lines
}

function showSftpImportResult(result: SftpVsCodeImportResult): void {
  const skipped = result.skipped.map((entry) =>
    translate('codezera.sftp.importSkipped', 'Skipped {{profile}}: {{reason}}', entry)
  )
  const description = [...hostLines([result]), ...skipped].join('\n') || undefined
  if (result.profiles.length === 0) {
    toast.error(translate('codezera.sftp.importNothing', 'No profile could be imported'), {
      description,
      ...MULTILINE
    })
    return
  }
  const show = result.hostsNeedingCredentials.length > 0 ? toast.warning : toast.success
  show(
    translate('codezera.sftp.imported', 'Imported {{count}} profile(s) from VS Code: {{names}}', {
      count: result.profiles.length,
      names: result.profiles.join(', ')
    }),
    { description, ...MULTILINE }
  )
}

export function showSftpImportAllResult(summary: SftpVsCodeImportAllResult): void {
  const lines = [
    ...summary.imported.map((result) =>
      translate('codezera.sftp.importAllWorkspace', '{{workspace}}: {{names}}', {
        workspace: folderName(result.workspacePath),
        names: result.profiles.join(', ') || '—'
      })
    ),
    ...hostLines(summary.imported),
    ...(summary.alreadyConfigured.length > 0
      ? [
          translate(
            'codezera.sftp.importAllKept',
            'Already set up, left unchanged: {{workspaces}}',
            { workspaces: summary.alreadyConfigured.map(folderName).join(', ') }
          )
        ]
      : []),
    ...summary.failed.map((entry) =>
      translate('codezera.sftp.importAllFailed', '{{workspace}} failed: {{error}}', {
        workspace: folderName(entry.workspacePath),
        error: entry.error
      })
    )
  ]
  const description = lines.join('\n') || undefined
  if (summary.imported.length === 0) {
    toast.info(translate('codezera.sftp.importAllNone', 'No workspace needed importing'), {
      description,
      ...MULTILINE
    })
    return
  }
  const show =
    summary.failed.length > 0 ||
    summary.imported.some((result) => result.hostsNeedingCredentials.length > 0)
      ? toast.warning
      : toast.success
  show(
    translate('codezera.sftp.importAllDone', 'Imported SFTP settings of {{count}} workspace(s)', {
      count: summary.imported.length
    }),
    { description, ...MULTILINE }
  )
}

/** Copies the workspace's `.vscode/sftp.json` into Codezera; the panel reloads from the change event. */
export async function importSftpFromVsCode(workspacePath: string): Promise<void> {
  try {
    showSftpImportResult(await window.api.codezera.sftp.importFromVsCode({ workspacePath }))
  } catch (error) {
    toast.error(translate('codezera.sftp.importFailed', 'Could not import from VS Code'), {
      description: sftpErrorText(error)
    })
  }
}
