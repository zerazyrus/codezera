import { useEffect, useState } from 'react'
import { CheckCircle2, Download, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { translate } from '@/i18n/i18n'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { CkitToolUpdate } from '../../../../shared/codezera/ckit-types'
import { CloudgoLogo } from './ckit-quota-presentation'

const CHECK_INTERVAL_MS = 6 * 60 * 60_000
// "Later" hides a release until a newer one ships.
const DISMISSED_KEY = 'codezera.ckit.dismissedToolUpdates'

type CardState =
  | { kind: 'available' }
  | { kind: 'updating' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string }

const releaseId = (update: CkitToolUpdate): string => `${update.tool}@${update.latest}`

function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Bottom-right notice when the installed ckit or omp has a newer release; one click updates both. */
export function CkitToolUpdateCard(): React.JSX.Element | null {
  const [updates, setUpdates] = useState<CkitToolUpdate[]>([])
  const [state, setState] = useState<CardState>({ kind: 'available' })

  useEffect(() => {
    // ckit and omp live on this computer; paired web clients cannot run them.
    if (isPairedWebClientWindow() || isWebClientLocation()) {
      return
    }
    const check = (): void => {
      void window.api.codezera.ckit.checkToolUpdates().then(
        (found) => {
          const dismissed = new Set(readDismissed())
          setUpdates(found.filter((u) => !dismissed.has(releaseId(u))))
        },
        (error: unknown) => console.warn('Failed to check ckit/omp updates:', error)
      )
    }
    check()
    const interval = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [])

  if (updates.length === 0) {
    return null
  }

  const close = (): void => {
    setUpdates([])
    setState({ kind: 'available' })
  }
  const later = (): void => {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify([...new Set([...readDismissed(), ...updates.map(releaseId)])])
    )
    close()
  }
  const update = (): void => {
    setState({ kind: 'updating' })
    void window.api.codezera.ckit.runToolUpdates(updates.map((u) => u.tool)).then(
      (result) =>
        setState(
          result.ok
            ? { kind: 'done' }
            : {
                kind: 'failed',
                message: `${translate('codezera.ckit.updateFailed', '{{tool}} update failed:', {
                  tool: result.tool
                })}\n${result.output}`
              }
        ),
      (error: unknown) =>
        setState({
          kind: 'failed',
          message: error instanceof Error ? error.message : String(error)
        })
    )
  }
  const updating = state.kind === 'updating'

  return (
    <div>
      <Card className="py-0 gap-0" role="complementary" aria-labelledby="ckit-tool-update-heading">
        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <CloudgoLogo size={16} />
              <h3 id="ckit-tool-update-heading" className="text-sm font-semibold">
                {state.kind === 'done'
                  ? translate('codezera.ckit.updateDoneTitle', 'ckit / omp updated')
                  : translate('codezera.ckit.updateTitle', 'ckit / omp update available')}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={close}
              disabled={updating}
              aria-label={translate('codezera.ckit.updateDismiss', 'Dismiss')}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <ul className="space-y-1 text-sm">
            {updates.map((u) => (
              <li key={u.tool} className="flex items-center gap-2">
                <span className="w-10 font-medium">{u.tool}</span>
                <span className="tabular-nums text-muted-foreground">
                  {u.current} → {u.latest}
                </span>
                {state.kind === 'done' ? (
                  <CheckCircle2 className="size-3.5 text-green-500" />
                ) : null}
              </li>
            ))}
          </ul>

          {state.kind === 'done' ? (
            <p className="text-sm text-muted-foreground">
              {translate(
                'codezera.ckit.updateDoneHint',
                'Open omp sessions keep the old version; restart them to use the new one.'
              )}
            </p>
          ) : null}
          {state.kind === 'failed' ? (
            <pre className="scrollbar-sleek max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs text-destructive">
              {state.message}
            </pre>
          ) : null}

          {state.kind === 'done' ? null : (
            <div className="mt-0.5 flex gap-2">
              <Button
                size="sm"
                className="min-w-0 flex-1 gap-1.5"
                onClick={update}
                disabled={updating}
              >
                {updating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                {updating
                  ? translate('codezera.ckit.updating', 'Updating…')
                  : state.kind === 'failed'
                    ? translate('codezera.ckit.updateRetry', 'Try again')
                    : translate('codezera.ckit.updateNow', 'Update now')}
              </Button>
              <Button variant="secondary" size="sm" onClick={later} disabled={updating}>
                {translate('codezera.ckit.updateLater', 'Later')}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
