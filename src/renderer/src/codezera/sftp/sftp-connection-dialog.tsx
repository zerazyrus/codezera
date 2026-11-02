import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { HostCombobox } from '@/components/host-picker/HostCombobox'
import type { SshTarget } from '../../../../shared/ssh-types'
import {
  DEFAULT_SFTP_IGNORE,
  DEFAULT_SFTP_TERMINAL_COMMAND,
  type SftpConnectionProfile
} from '../../../../shared/codezera/sftp-types'
import { sftpErrorText } from './sftp-actions'
import { useSftpStore } from './sftp-store'

type FormState = {
  name: string
  sshTargetId: string
  remotePath: string
  uploadOnSave: boolean
  ignore: string
  terminalCommand: string
}

function initialForm(profile: SftpConnectionProfile | null): FormState {
  return {
    name: profile?.name ?? '',
    sshTargetId: profile?.sshTargetId ?? '',
    remotePath: profile?.remotePath ?? '',
    uploadOnSave: profile?.uploadOnSave ?? false,
    ignore: (profile?.ignore ?? DEFAULT_SFTP_IGNORE).join('\n'),
    terminalCommand: profile?.terminalCommand ?? ''
  }
}

function validate(form: FormState, otherNames: readonly string[]): string | null {
  const name = form.name.trim()
  if (!name) {
    return translate('codezera.sftp.formNameRequired', 'Enter a profile name.')
  }
  if (otherNames.includes(name)) {
    return translate('codezera.sftp.formNameTaken', 'Another profile already uses this name.')
  }
  if (!form.sshTargetId) {
    return translate('codezera.sftp.formHostRequired', 'Choose an SSH host.')
  }
  if (!form.remotePath.trim().startsWith('/')) {
    return translate(
      'codezera.sftp.formRemotePathAbsolute',
      'Remote path must be absolute, e.g. /var/www/site.'
    )
  }
  return null
}

/** Add/edit form for one SFTP profile of a workspace. */
export function SftpConnectionDialog({
  open,
  onOpenChange,
  workspacePath,
  profile,
  profileNames
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspacePath: string
  /** Profile being edited; null adds a new one. */
  profile: SftpConnectionProfile | null
  profileNames: readonly string[]
}): React.JSX.Element {
  const [form, setForm] = useState<FormState>(() => initialForm(profile))
  const [targets, setTargets] = useState<SshTarget[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setForm(initialForm(profile))
    setError(null)
    let alive = true
    void window.api.ssh
      .listTargets()
      .then((list) => alive && setTargets(list))
      .catch(() => alive && setTargets([]))
    return () => {
      alive = false
    }
  }, [open, profile])

  const update = (patch: Partial<FormState>): void =>
    setForm((current) => ({ ...current, ...patch }))
  const otherNames = profileNames.filter((name) => name !== profile?.name)

  const openSshSettings = (): void => {
    onOpenChange(false)
    const state = useAppStore.getState()
    state.openSettingsTarget({ pane: 'ssh', repoId: null, sectionId: 'ssh' })
    state.openSettingsPage()
  }

  const submit = async (): Promise<void> => {
    const problem = validate(form, otherNames)
    setError(problem)
    if (problem) {
      return
    }
    setSaving(true)
    try {
      const terminalCommand = form.terminalCommand.trim()
      const state = await window.api.codezera.sftp.saveProfile({
        workspacePath,
        previousName: profile?.name ?? null,
        profile: {
          name: form.name.trim(),
          sshTargetId: form.sshTargetId,
          remotePath: form.remotePath.trim(),
          uploadOnSave: form.uploadOnSave,
          ignore: form.ignore.split('\n'),
          ...(terminalCommand ? { terminalCommand } : {})
        }
      })
      useSftpStore.getState().apply(workspacePath, state)
      onOpenChange(false)
    } catch (saveError) {
      setError(sftpErrorText(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {profile
              ? translate('codezera.sftp.formEditTitle', 'Edit SFTP profile')
              : translate('codezera.sftp.formAddTitle', 'Add SFTP connection')}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sftp-profile-name">
              {translate('codezera.sftp.formName', 'Profile name')}
            </Label>
            <Input
              id="sftp-profile-name"
              value={form.name}
              placeholder={translate('codezera.sftp.formNamePlaceholder', 'e.g. dev, prod')}
              autoFocus
              onChange={(event) => update({ name: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="sftp-profile-host">
                {translate('codezera.sftp.formHost', 'SSH host')}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="gap-1 text-muted-foreground"
                onClick={openSshSettings}
              >
                <Settings2 className="size-3" />
                {translate('codezera.sftp.formManageHosts', 'Add or edit SSH hosts')}
              </Button>
            </div>
            <HostCombobox
              id="sftp-profile-host"
              value={form.sshTargetId}
              onChange={(sshTargetId) => update({ sshTargetId })}
              options={targets.map((target) => ({
                id: target.id,
                label: target.label,
                detail: `${target.username ? `${target.username}@` : ''}${target.host}:${target.port}`
              }))}
              placeholder={translate(
                'codezera.sftp.formHostPlaceholder',
                'Choose a saved SSH host'
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sftp-profile-remote">
              {translate('codezera.sftp.formRemotePath', 'Remote path')}
            </Label>
            <Input
              id="sftp-profile-remote"
              value={form.remotePath}
              placeholder={translate('codezera.sftp.formRemotePathPlaceholder', '/var/www/site')}
              onChange={(event) => update({ remotePath: event.target.value })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="sftp-profile-upload-on-save">
              {translate('codezera.sftp.uploadOnSave', 'Upload on save')}
            </Label>
            <Switch
              id="sftp-profile-upload-on-save"
              checked={form.uploadOnSave}
              onCheckedChange={(uploadOnSave) => update({ uploadOnSave })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sftp-profile-ignore">
              {translate('codezera.sftp.formIgnore', 'Ignore (one glob per line)')}
            </Label>
            <Textarea
              id="sftp-profile-ignore"
              rows={4}
              className="scrollbar-sleek font-mono text-xs"
              value={form.ignore}
              onChange={(event) => update({ ignore: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sftp-profile-terminal">
              {translate('codezera.sftp.formTerminal', 'Terminal command (optional)')}
            </Label>
            <Input
              id="sftp-profile-terminal"
              className="font-mono text-xs"
              value={form.terminalCommand}
              placeholder={DEFAULT_SFTP_TERMINAL_COMMAND}
              onChange={(event) => update({ terminalCommand: event.target.value })}
            />
          </div>
          {error && <p className="text-xs break-words text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {translate('codezera.sftp.cancel', 'Cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {translate('codezera.sftp.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
