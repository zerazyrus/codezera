import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SearchableSetting } from '@/components/settings/section-layout/SearchableSetting'
import { translate } from '@/i18n/i18n'
import { sftpErrorText } from './sftp-actions'
import { showSftpImportAllResult } from './sftp-import-feedback'
import { getCodezeraSftpSearchEntries } from './sftp-settings-search'

/** Settings row: one-time copy of every known workspace's VS Code SFTP config. */
export function SftpImportAllSetting(): React.JSX.Element {
  const [running, setRunning] = useState(false)
  const [entry] = getCodezeraSftpSearchEntries()
  const run = async (): Promise<void> => {
    setRunning(true)
    try {
      showSftpImportAllResult(await window.api.codezera.sftp.importAllFromVsCode())
    } catch (error) {
      toast.error(translate('codezera.sftp.importFailed', 'Could not import from VS Code'), {
        description: sftpErrorText(error)
      })
    } finally {
      setRunning(false)
    }
  }
  return (
    <SearchableSetting {...entry!} className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 space-y-1">
        <Label>{entry!.title}</Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'codezera.sftp.settingHelp',
            'Imports workspaces that have .vscode/sftp.json and no Codezera SFTP connection yet. Servers become SSH hosts.'
          )}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        disabled={running}
        onClick={() => void run()}
      >
        {running ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        {translate('codezera.sftp.importAll', 'Import all from VS Code')}
      </Button>
    </SearchableSetting>
  )
}
