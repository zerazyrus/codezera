import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SearchableSetting } from '@/components/settings/SearchableSetting'
import { translate } from '@/i18n/i18n'
import type { OrcaImportProbe } from '../../../../shared/codezera/orca-import-types'

function useOrcaImport(): {
  probe: OrcaImportProbe | null
  running: boolean
  run: () => Promise<void>
} {
  const [probe, setProbe] = useState<OrcaImportProbe | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let alive = true
    window.api.codezera.orcaImport
      .probe()
      .then((result) => alive && setProbe(result))
      .catch(() => alive && setProbe({ available: false }))
    return () => {
      alive = false
    }
  }, [])

  const run = async (): Promise<void> => {
    setRunning(true)
    try {
      // Resolves 'relaunching' just before the app quits, so the spinner stays until then.
      if ((await window.api.codezera.orcaImport.run()).status === 'cancelled') {
        setRunning(false)
      }
    } catch (error) {
      setRunning(false)
      toast.error(
        translate('codezera.orcaImport.failed', 'Could not import from Orca: {{message}}', {
          message: error instanceof Error ? error.message : String(error)
        })
      )
    }
  }

  return { probe, running, run }
}

function ImportButton({
  running,
  onClick
}: {
  running: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 gap-1.5"
      disabled={running}
      onClick={onClick}
    >
      {running ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      {translate('codezera.orcaImport.action', 'Import from Orca')}
    </Button>
  )
}

/** Onboarding banner: shown only when an Orca profile exists on this computer. */
export function ImportFromOrcaNotice(): React.JSX.Element | null {
  const { probe, running, run } = useOrcaImport()
  if (!probe?.available) {
    return null
  }
  return (
    <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">
          {translate('codezera.orcaImport.noticeTitle', 'Already using Orca?')}
        </div>
        <div className="text-xs text-muted-foreground">
          {translate(
            'codezera.orcaImport.noticeDescription',
            'Bring over {{count}} projects, workspaces and settings instead of setting up again.',
            { count: probe.projectCount }
          )}
        </div>
      </div>
      <ImportButton running={running} onClick={() => void run()} />
    </div>
  )
}

/** Settings row; stays visible without Orca so the option is discoverable. */
export function ImportFromOrcaSetting(): React.JSX.Element {
  const { probe, running, run } = useOrcaImport()
  const title = translate('codezera.orcaImport.settingTitle', 'Import from Orca')
  return (
    <SearchableSetting
      title={title}
      description={translate(
        'codezera.orcaImport.settingDescription',
        'Replace projects, workspaces and settings with the ones from Orca on this computer.'
      )}
      keywords={['orca', 'import', 'migrate', 'projects', 'settings']}
      className="flex items-center justify-between gap-4 py-2"
    >
      <div className="min-w-0 space-y-1">
        <Label>{title}</Label>
        <p className="text-xs text-muted-foreground">
          {probe === null
            ? null
            : probe.available
              ? translate(
                  'codezera.orcaImport.settingFound',
                  'Found {{count}} projects in {{path}}. Current data is kept in a backup folder.',
                  { count: probe.projectCount, path: probe.sourcePath }
                )
              : translate('codezera.orcaImport.settingMissing', 'No Orca data on this computer.')}
        </p>
      </div>
      {probe?.available ? <ImportButton running={running} onClick={() => void run()} /> : null}
    </SearchableSetting>
  )
}
