import type React from 'react'
import { useState } from 'react'
import { CloudDownload, Eye, EyeOff, Pencil, Scissors, Trash2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { GitGraphAction, GitGraphRemote } from '../../../../shared/codezera/git-graph-types'

type RemoteDraft = { original: string | null; name: string; fetchUrl: string; pushUrl: string }

function IconAction({
  label,
  onClick,
  disabled,
  children
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function RemoteForm({
  draft,
  busy,
  onChange,
  onCancel,
  onSave
}: {
  draft: RemoteDraft
  busy: boolean
  onChange: (draft: RemoteDraft) => void
  onCancel: () => void
  onSave: () => void
}): React.JSX.Element {
  return (
    <form
      className="grid grid-cols-[6rem_1fr] items-center gap-2 rounded-md border border-border p-3"
      data-testid="git-graph-remote-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <span className="text-muted-foreground">
        {translate('codezera.gitGraph.settings.remoteName', 'Name')}
      </span>
      <Input
        autoFocus
        value={draft.name}
        placeholder={translate('codezera.gitGraph.settings.remoteNamePlaceholder', 'origin')}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
      />
      <span className="text-muted-foreground">
        {translate('codezera.gitGraph.settings.fetchUrl', 'Fetch URL')}
      </span>
      <Input
        value={draft.fetchUrl}
        placeholder={translate(
          'codezera.gitGraph.settings.fetchUrlPlaceholder',
          'git@gitlab.com:group/project.git'
        )}
        onChange={(event) => onChange({ ...draft, fetchUrl: event.target.value })}
      />
      <span className="text-muted-foreground">
        {translate('codezera.gitGraph.settings.pushUrl', 'Push URL')}
      </span>
      <Input
        value={draft.pushUrl}
        placeholder={translate('codezera.gitGraph.settings.pushUrlSame', 'Same as fetch URL')}
        onChange={(event) => onChange({ ...draft, pushUrl: event.target.value })}
      />
      <div className="col-span-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          {translate('codezera.gitGraph.dialog.cancel', 'Cancel')}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={busy || !draft.name.trim() || !draft.fetchUrl.trim()}
        >
          {translate('codezera.gitGraph.settings.saveRemote', 'Save remote')}
        </Button>
      </div>
    </form>
  )
}

export function GitGraphRemotesSection({
  remotes,
  hiddenRemotes,
  busy,
  onToggleHidden,
  onRun
}: {
  remotes: GitGraphRemote[]
  hiddenRemotes: string[]
  busy: boolean
  onToggleHidden: (name: string) => void
  onRun: (action: GitGraphAction) => Promise<boolean>
}): React.JSX.Element {
  const [draft, setDraft] = useState<RemoteDraft | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const saveDraft = async (): Promise<void> => {
    if (!draft) {
      return
    }
    const name = draft.name.trim()
    const fetchUrl = draft.fetchUrl.trim()
    const pushUrl = draft.pushUrl.trim() || null
    const ok = await onRun(
      draft.original === null
        ? { kind: 'addRemote', name, fetchUrl, pushUrl }
        : { kind: 'editRemote', name: draft.original, newName: name, fetchUrl, pushUrl }
    )
    if (ok) {
      setDraft(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {remotes.length === 0 ? (
        <span className="text-muted-foreground">
          {translate('codezera.gitGraph.settings.noRemotes', 'This repository has no remotes.')}
        </span>
      ) : null}
      {remotes.map((remote) => {
        const hidden = hiddenRemotes.includes(remote.name)
        return (
          <div
            key={remote.name}
            data-testid="git-graph-remote"
            className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 rounded-md border border-border px-3 py-2"
          >
            <span className="truncate font-bold">{remote.name}</span>
            <div className="min-w-0 font-mono text-[12px] leading-5">
              <div className="truncate" title={remote.fetchUrl ?? ''}>
                <span className="text-muted-foreground">
                  {translate('codezera.gitGraph.settings.fetchLabel', 'fetch')}{' '}
                </span>
                {remote.fetchUrl}
              </div>
              <div className="truncate" title={remote.pushUrl ?? ''}>
                <span className="text-muted-foreground">
                  {translate('codezera.gitGraph.settings.pushLabel', 'push')}{' '}
                </span>
                {remote.pushUrl ?? remote.fetchUrl}
              </div>
            </div>
            {pendingDelete === remote.name ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  disabled={busy}
                  onClick={() =>
                    void onRun({ kind: 'deleteRemote', name: remote.name }).then(() =>
                      setPendingDelete(null)
                    )
                  }
                >
                  {translate('codezera.gitGraph.settings.confirmDelete', 'Delete')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setPendingDelete(null)}
                >
                  {translate('codezera.gitGraph.dialog.cancel', 'Cancel')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center">
                <IconAction
                  label={translate('codezera.gitGraph.settings.fetchRemote', 'Fetch')}
                  disabled={busy}
                  onClick={() =>
                    void onRun({ kind: 'fetchRemote', name: remote.name, prune: false })
                  }
                >
                  <CloudDownload />
                </IconAction>
                <IconAction
                  label={translate(
                    'codezera.gitGraph.settings.pruneRemote',
                    'Prune stale remote branches'
                  )}
                  disabled={busy}
                  onClick={() => void onRun({ kind: 'pruneRemote', name: remote.name })}
                >
                  <Scissors />
                </IconAction>
                <IconAction
                  label={
                    hidden
                      ? translate('codezera.gitGraph.settings.showRemote', 'Show branches in graph')
                      : translate(
                          'codezera.gitGraph.settings.hideRemote',
                          'Hide branches from graph'
                        )
                  }
                  onClick={() => onToggleHidden(remote.name)}
                >
                  {hidden ? <EyeOff /> : <Eye />}
                </IconAction>
                <IconAction
                  label={translate('codezera.gitGraph.settings.editRemote', 'Edit')}
                  disabled={busy}
                  onClick={() =>
                    setDraft({
                      original: remote.name,
                      name: remote.name,
                      fetchUrl: remote.fetchUrl ?? '',
                      pushUrl:
                        remote.pushUrl && remote.pushUrl !== remote.fetchUrl ? remote.pushUrl : ''
                    })
                  }
                >
                  <Pencil />
                </IconAction>
                <IconAction
                  label={translate('codezera.gitGraph.settings.deleteRemote', 'Delete')}
                  disabled={busy}
                  onClick={() => setPendingDelete(remote.name)}
                >
                  <Trash2 />
                </IconAction>
              </div>
            )}
          </div>
        )
      })}
      {draft ? (
        <RemoteForm
          draft={draft}
          busy={busy}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => void saveDraft()}
        />
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setDraft({ original: null, name: '', fetchUrl: '', pushUrl: '' })}
          >
            {translate('codezera.gitGraph.settings.addRemote', 'Add remote')}
          </Button>
        </div>
      )}
    </div>
  )
}
