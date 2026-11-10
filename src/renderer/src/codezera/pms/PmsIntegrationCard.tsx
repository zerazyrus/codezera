import React, { useEffect, useState } from 'react'
import { ClipboardList, Loader2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  IntegrationCardDetails,
  IntegrationCardShell
} from '@/components/integrations/presentation/integration-card-shell'
import { translate, usePmsCatalog } from './pms-i18n'
import type { PmsAccountInput } from '../../../../shared/codezera/pms-types'
import { pmsAvailable, pmsErrorText, usePmsStore } from './pms-store'
import { DEFAULT_PMS_WORKFLOW, loadPmsWorkflow, savePmsWorkflow } from './pms-workflow'
import { PmsAgentSkillSetting } from './pms-agent-skill-setting'

export const PMS_INTEGRATION_SECTION_ID = 'integrations-pms'

const DEFAULT_BASE_URL = 'https://pms.cloudgo.vn'

function AccountForm(): React.JSX.Element {
  const connect = usePmsStore((s) => s.connect)
  const [values, setValues] = useState<PmsAccountInput>({
    baseUrl: DEFAULT_BASE_URL,
    username: '',
    password: '',
    accessKey: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const complete = Object.values(values).every((value) => value.trim())

  const field = (key: keyof PmsAccountInput, label: string, type = 'text'): React.JSX.Element => (
    <div className="space-y-1">
      <Label htmlFor={`pms-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`pms-${key}`}
        type={type}
        autoComplete="off"
        spellCheck={false}
        value={values[key]}
        onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))}
        className="h-8 text-xs"
      />
    </div>
  )

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        setSaving(true)
        setError(null)
        connect(values)
          .catch((err: unknown) => setError(pmsErrorText(err)))
          .finally(() => setSaving(false))
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {field('baseUrl', translate('codezera.pms.baseUrl', 'PMS URL'))}
        {field('username', translate('codezera.pms.username', 'Username'))}
        {field('password', translate('codezera.pms.password', 'Password'), 'password')}
        {field('accessKey', translate('codezera.pms.accessKey', 'OpenAPI access key'), 'password')}
      </div>
      <Button type="submit" size="sm" disabled={saving || !complete} className="gap-1">
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
        {translate('codezera.pms.connect', 'Verify & connect')}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  )
}

/** Off by default: each person sees only their own tickets until they turn this on. */
function ViewOthersSetting(): React.JSX.Element {
  const viewOthers = usePmsStore((s) => s.viewOthers)
  const setViewOthers = usePmsStore((s) => s.setViewOthers)
  return (
    <IntegrationCardDetails>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="pms-view-others">
            {translate('codezera.pms.viewOthers.title', "View other employees' tickets")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'codezera.pms.viewOthers.hint',
              'Adds an employee picker to My work, Tickets and Tasks. My work of others follows PMS: only Ticket Dashboard managers get it.'
            )}
          </p>
        </div>
        <Switch id="pms-view-others" checked={viewOthers} onCheckedChange={setViewOthers} />
      </div>
    </IntegrationCardDetails>
  )
}

/** The steps every agent started from a PMS ticket or task follows; teams rewrite it for their process. */
function WorkflowEditor(): React.JSX.Element {
  const [saved, setSaved] = useState(loadPmsWorkflow)
  const [text, setText] = useState(saved)
  return (
    <IntegrationCardDetails>
      <Label htmlFor="pms-agent-workflow" className="text-xs">
        {translate('codezera.pms.workflow.title', 'Agent workflow')}
      </Label>
      <p className="text-xs text-muted-foreground">
        {translate(
          'codezera.pms.workflow.hint',
          'Added to the prompt of every agent started from a PMS ticket or task.'
        )}
      </p>
      <Textarea
        id="pms-agent-workflow"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-h-56 font-mono text-xs"
      />
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={text === DEFAULT_PMS_WORKFLOW}
          onClick={() => setText(DEFAULT_PMS_WORKFLOW)}
        >
          {translate('codezera.pms.workflow.reset', 'Restore default')}
        </Button>
        <Button
          size="sm"
          disabled={text === saved}
          onClick={() => {
            savePmsWorkflow(text)
            const next = loadPmsWorkflow()
            setSaved(next)
            setText(next)
            toast.success(translate('codezera.pms.workflow.saved', 'Workflow saved'))
          }}
        >
          {translate('codezera.pms.save', 'Save')}
        </Button>
      </div>
    </IntegrationCardDetails>
  )
}

/** Settings → Integrations → Task providers, next to Linear and Jira. */
export function PmsIntegrationCard(): React.JSX.Element | null {
  usePmsCatalog()
  const status = usePmsStore((s) => s.status)
  const loadStatus = usePmsStore((s) => s.loadStatus)
  const disconnect = usePmsStore((s) => s.disconnect)
  const connectFromSkillConfig = usePmsStore((s) => s.connectFromSkillConfig)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  if (!pmsAvailable()) {
    return null
  }

  const run = (action: () => Promise<void>): void => {
    setBusy(true)
    setError(null)
    action()
      .then(() => setEditing(false))
      .catch((err: unknown) => setError(pmsErrorText(err)))
      .finally(() => setBusy(false))
  }

  const connected = status?.state === 'connected'
  const showForm = status !== null && (!connected || editing)

  return (
    <IntegrationCardShell
      settingsSectionId={PMS_INTEGRATION_SECTION_ID}
      icon={<ClipboardList className="size-5" />}
      name={translate('codezera.pms.title', 'CloudGO PMS')}
      description={
        connected
          ? translate('codezera.pms.connectedAs', '{{name}} ({{username}}) on {{url}}', {
              name: status.userName,
              username: status.username,
              url: status.baseUrl
            })
          : translate(
              'codezera.pms.description',
              'Add PMS access to browse tickets and tasks, move their status, log time and start workspaces from them.'
            )
      }
      checking={status === null}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={
        connected
          ? translate('codezera.pms.statusConnected', 'Connected')
          : status?.state === 'error'
            ? translate('codezera.pms.statusError', 'Cannot reach PMS')
            : translate('codezera.pms.statusNotConnected', 'Not connected')
      }
      actions={
        connected && !editing ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {translate('codezera.pms.changeAccount', 'Change account')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              className="gap-1"
              onClick={() => run(disconnect)}
            >
              <Unlink className="size-3.5" />
              {translate('codezera.pms.disconnect', 'Disconnect')}
            </Button>
          </>
        ) : null
      }
    >
      {showForm ? (
        <IntegrationCardDetails>
          {status.state === 'error' ? (
            <p className="text-xs text-destructive">{status.message}</p>
          ) : null}
          {status.state === 'not-configured' && status.skillConfigFound ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {translate(
                  'codezera.pms.skillConfigFound',
                  'Found the account of the /pms agent skill on this computer.'
                )}
              </p>
              <Button
                size="sm"
                disabled={busy}
                className="shrink-0 gap-1"
                onClick={() => run(connectFromSkillConfig)}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {translate('codezera.pms.useSkillConfig', 'Use this account')}
              </Button>
            </div>
          ) : null}
          <AccountForm />
          {editing ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {translate('codezera.pms.cancel', 'Cancel')}
            </Button>
          ) : null}
        </IntegrationCardDetails>
      ) : null}
      {connected && !editing ? (
        <>
          <ViewOthersSetting />
          <PmsAgentSkillSetting />
          <WorkflowEditor />
        </>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </IntegrationCardShell>
  )
}
