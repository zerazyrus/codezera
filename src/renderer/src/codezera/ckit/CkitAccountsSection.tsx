import React, { useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OnboardingInlineCommandTerminal } from '@/components/onboarding/OnboardingInlineCommandTerminal'
import { barColor } from '@/components/status-bar/provider-extra-usage-section'
import { translate } from '@/i18n/i18n'
import { isWindowsDesktopClient } from '@/lib/windows-path-access'
import type { CkitQuotaStatus } from '../../../../shared/codezera/ckit-types'
import { useCkitQuotaStore } from './ckit-quota-store'
import { CloudgoLogo, ckitResetLabel, ckitWindowLabel } from './ckit-quota-presentation'

export const CKIT_SEARCH_KEYWORDS = ['ckit', 'cloudgo', 'gateway', 'quota', 'usage', 'omp', 'key']

const CKIT_RAW = 'https://raw.githubusercontent.com/dante241/ckit_agent/main'
// The installer's bin dirs may not be on PATH yet in this shell; `harness global` applies the team omp rules.
const CKIT_INSTALL_COMMAND = `export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH" && curl -fsSL ${CKIT_RAW}/install.sh | sh && ckit setup --no-profile && ckit harness global`
// Windows PowerShell 5.1 has no `&&`. Installers run in child shells so an `exit` inside them keeps this one;
// ckit setup needs Bun there to install omp and codegraph.
const CKIT_WINDOWS_INSTALL_COMMAND = [
  'if (-not (Get-Command bun -ErrorAction SilentlyContinue)) { powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://bun.sh/install.ps1 | iex" }',
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm ${CKIT_RAW}/install.ps1 | iex"`,
  '$env:Path = "$env:USERPROFILE\\.bun\\bin;$env:LOCALAPPDATA\\Programs\\ckit;$env:Path"',
  'ckit setup --no-profile',
  'if ($LASTEXITCODE -eq 0) { ckit harness global }'
].join('; ')

function StepTitle({
  step,
  done,
  children
}: {
  step: number
  done: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <h4 className="flex items-center gap-2 text-xs font-semibold">
      {done ? (
        <CheckCircle2 className="size-4 text-emerald-500" />
      ) : (
        <span className="inline-flex size-4 items-center justify-center rounded-full border border-border text-[10px]">
          {step}
        </span>
      )}
      {children}
    </h4>
  )
}

function ApiKeyForm({ onSaved }: { onSaved?: () => void }): React.JSX.Element {
  const saveApiKey = useCkitQuotaStore((s) => s.saveApiKey)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoApprove, setAutoApprove] = useState(false)

  const submit = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await saveApiKey(value, { autoApprove })
      setValue('')
      onSaved?.()
    } catch (err) {
      // IPC prefixes remote errors; show only the reason.
      const message = err instanceof Error ? err.message : String(err)
      setError(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-8 font-mono text-xs"
          aria-label={translate('codezera.ckit.keyLabel', 'CloudGO gateway API key')}
        />
        <Button
          type="submit"
          size="sm"
          disabled={saving || !value.trim()}
          className="shrink-0 gap-1"
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <KeyRound className="size-3.5" />
          )}
          {translate('codezera.ckit.saveKey', 'Verify & save')}
        </Button>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="codezera-ckit-auto-approve"
          className="mt-0.5"
          checked={autoApprove}
          disabled={saving}
          onCheckedChange={(next) => setAutoApprove(next === true)}
        />
        <Label htmlFor="codezera-ckit-auto-approve" className="text-xs font-normal leading-snug">
          {translate(
            'codezera.ckit.autoApprove',
            'Let omp run tools without asking (approvalMode: yolo). Faster, but the agent can run any command on this computer.'
          )}
        </Label>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  )
}

function SetupSteps({
  status
}: {
  status: Extract<CkitQuotaStatus, { state: 'not-configured' }>
}): React.JSX.Element {
  const refresh = useCkitQuotaStore((s) => s.refresh)
  const windows = isWindowsDesktopClient()

  return (
    <div className="space-y-5 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="space-y-2">
        <StepTitle step={1} done={status.ckitInstalled}>
          {translate('codezera.ckit.step1', 'Install ckit')}
        </StepTitle>
        {status.ckitInstalled ? (
          <p className="text-xs text-muted-foreground">
            {translate('codezera.ckit.installed', 'ckit is installed on this computer.')}
          </p>
        ) : (
          <OnboardingInlineCommandTerminal
            command={windows ? CKIT_WINDOWS_INSTALL_COMMAND : CKIT_INSTALL_COMMAND}
            title={translate('codezera.ckit.installTerminal', 'ckit setup')}
            ariaLabel={translate('codezera.ckit.installTerminalLabel', 'ckit install terminal')}
            description={
              windows
                ? translate(
                    'codezera.ckit.installHintWindows',
                    'Press Enter to install Bun (if missing), ckit and its agent harness (omp, skills, codegraph, MCP servers) in PowerShell.'
                  )
                : translate(
                    'codezera.ckit.installHint',
                    'Press Enter to install ckit and its agent harness (omp, skills, codegraph, MCP servers).'
                  )
            }
            terminalHeightPx={260}
            terminalTopMarginPx={8}
            descriptionPaddingClassName="px-4 py-2"
            autoScrollIntoView={false}
            worktreeId="codezera-ckit-install-terminal"
            shellOverride={windows ? 'powershell.exe' : undefined}
            forceHostRuntime
            onCommandFinished={() => void refresh()}
          />
        )}
      </div>
      <div className="space-y-2">
        <StepTitle step={2} done={false}>
          {translate('codezera.ckit.step2', 'Enter your CloudGO gateway key')}
        </StepTitle>
        <p className="text-xs text-muted-foreground">
          {translate(
            'codezera.ckit.step2Hint',
            'Codezera checks the key with the gateway and saves it to {{path}} with the CloudGO Claude provider, then writes the team model roles and omp settings (memory, compaction, autolearn) to config.yml next to it, so ckit, omp and Codezera all use it. Settings you already changed are kept, and each file gets a backup.',
            { path: status.configPath }
          )}
        </p>
        <ApiKeyForm />
      </div>
    </div>
  )
}

export function CkitAccountsSection(): React.JSX.Element {
  const status = useCkitQuotaStore((s) => s.status)
  const refreshing = useCkitQuotaStore((s) => s.refreshing)
  const refresh = useCkitQuotaStore((s) => s.refresh)
  const [changingKey, setChangingKey] = useState(false)

  return (
    <section id="accounts-ckit" className="space-y-4 scroll-mt-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CloudgoLogo size={16} />
          {translate('codezera.ckit.title', 'Ckit (CloudGO AI Gateway)')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'codezera.ckit.description',
            'Set up ckit and your CloudGO gateway key, then track your personal quota in the status bar.'
          )}
        </p>
      </div>

      {!status ? (
        <p className="text-xs text-muted-foreground">
          {translate('codezera.ckit.loading', 'Loading…')}
        </p>
      ) : status.state === 'not-configured' ? (
        <SetupSteps status={status} />
      ) : (
        <>
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-xs text-muted-foreground">
                {translate('codezera.ckit.keyFound', 'Provider {{provider}} · key {{key}}', {
                  provider: status.provider,
                  key: status.keyHint
                })}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="xs" onClick={() => setChangingKey((v) => !v)}>
                  {translate('codezera.ckit.changeKey', 'Change key')}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={refreshing}
                  onClick={() => void refresh()}
                  className="gap-1"
                >
                  {refreshing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  {translate('codezera.ckit.refresh', 'Refresh quota')}
                </Button>
              </div>
            </div>
            {changingKey ? <ApiKeyForm onSaved={() => setChangingKey(false)} /> : null}
          </div>

          {status.state === 'error' ? (
            <p className="text-xs text-destructive">{status.message}</p>
          ) : status.windows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate('codezera.ckit.unlimitedHint', 'This key has no quota limit.')}
            </p>
          ) : (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              {status.windows.map((w) => {
                const used = Math.min(100, Math.max(0, w.usedPercent))
                return (
                  <div key={w.kind} className="flex items-center gap-3 text-xs">
                    <span className="w-10 shrink-0 font-medium">{ckitWindowLabel(w)}</span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${w.exceeded ? 'bg-red-500' : barColor(used)}`}
                        style={{ width: `${used}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right tabular-nums">
                      {Math.round(w.usedPercent)}%
                    </span>
                    <span className="w-36 shrink-0 truncate text-muted-foreground">
                      {ckitResetLabel(w) ?? ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
