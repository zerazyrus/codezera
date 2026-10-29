import type React from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  GitGraphAction,
  GitGraphConfigScope,
  GitGraphRepoInfo,
  GitGraphRepoSettings
} from '../../../../shared/codezera/git-graph-types'

type UserDraft = { name: string; email: string; scope: GitGraphConfigScope }

export function GitGraphUserSection({
  info,
  busy,
  onRun
}: {
  info: GitGraphRepoInfo | null
  busy: boolean
  onRun: (action: GitGraphAction) => Promise<boolean>
}): React.JSX.Element {
  const [draft, setDraft] = useState<UserDraft | null>(null)
  if (draft) {
    return (
      <form
        className="grid grid-cols-[6rem_1fr] items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void onRun({ kind: 'setUser', ...draft }).then((ok) => (ok ? setDraft(null) : undefined))
        }}
      >
        <span className="text-muted-foreground">
          {translate('codezera.gitGraph.settings.userName', 'Name')}
        </span>
        <Input
          autoFocus
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <span className="text-muted-foreground">
          {translate('codezera.gitGraph.settings.userEmail', 'Email')}
        </span>
        <Input
          value={draft.email}
          onChange={(event) => setDraft({ ...draft, email: event.target.value })}
        />
        <span className="text-muted-foreground">
          {translate('codezera.gitGraph.settings.scope', 'Scope')}
        </span>
        <div className="flex gap-1">
          {(['local', 'global'] as const).map((scope) => (
            <Button
              key={scope}
              type="button"
              size="xs"
              variant={draft.scope === scope ? 'default' : 'outline'}
              onClick={() => setDraft({ ...draft, scope })}
            >
              {scope === 'local'
                ? translate('codezera.gitGraph.settings.scopeLocal', 'This repository')
                : translate('codezera.gitGraph.settings.scopeGlobal', 'Global (all repositories)')}
            </Button>
          ))}
        </div>
        <div className="col-span-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setDraft(null)}
          >
            {translate('codezera.gitGraph.dialog.cancel', 'Cancel')}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={busy || !draft.name.trim() || !draft.email.trim()}
          >
            {translate('codezera.gitGraph.settings.saveUser', 'Save user')}
          </Button>
        </div>
      </form>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate" data-testid="git-graph-settings-user">
        {info?.userName || info?.userEmail ? (
          <>
            {translate('codezera.gitGraph.settings.userValue', '{{name}} <{{email}}>', {
              name: info.userName ?? '',
              email: info.userEmail ?? ''
            })}{' '}
            <span className="text-muted-foreground">
              (
              {info.userScope === 'local'
                ? translate('codezera.gitGraph.settings.scopeLocal', 'This repository')
                : translate('codezera.gitGraph.settings.scopeGlobal', 'Global (all repositories)')}
              )
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {translate('codezera.gitGraph.settings.userUnset', 'Not set')}
          </span>
        )}
      </span>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={busy || !info}
        onClick={() =>
          setDraft({
            name: info?.userName ?? '',
            email: info?.userEmail ?? '',
            scope: info?.userScope ?? 'local'
          })
        }
      >
        {translate('codezera.gitGraph.settings.editUser', 'Edit')}
      </Button>
      {info?.userScope === 'local' ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={() => void onRun({ kind: 'unsetUser', scope: 'local' })}
        >
          {translate('codezera.gitGraph.settings.removeLocalUser', 'Use global user')}
        </Button>
      ) : null}
    </div>
  )
}

export function GitGraphIssueLinkingSection({
  settings,
  onSave
}: {
  settings: GitGraphRepoSettings
  onSave: (patch: Partial<GitGraphRepoSettings>) => void
}): React.JSX.Element {
  const [regex, setRegex] = useState(settings.issueLinking?.issueRegex ?? '')
  const [url, setUrl] = useState(settings.issueLinking?.issueUrl ?? '')
  const save = (): void => {
    try {
      new RegExp(regex, 'g')
    } catch (error) {
      toast.error(translate('codezera.gitGraph.settings.badRegex', 'Invalid regular expression'), {
        description: error instanceof Error ? error.message : String(error)
      })
      return
    }
    onSave({ issueLinking: { issueRegex: regex, issueUrl: url.trim() } })
  }
  return (
    <form
      className="grid grid-cols-[6rem_1fr] items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <span className="text-muted-foreground">
        {translate('codezera.gitGraph.settings.issueRegex', 'Issue regex')}
      </span>
      <Input
        value={regex}
        placeholder={translate('codezera.gitGraph.settings.issueRegexPlaceholder', '#(\\d+)')}
        onChange={(event) => setRegex(event.target.value)}
      />
      <span className="text-muted-foreground">
        {translate('codezera.gitGraph.settings.issueUrl', 'Issue URL')}
      </span>
      <Input
        value={url}
        placeholder={translate(
          'codezera.gitGraph.settings.issueUrlPlaceholder',
          'https://gitlab.com/group/project/-/issues/$1'
        )}
        onChange={(event) => setUrl(event.target.value)}
      />
      <div className="col-span-2 flex justify-end gap-2">
        {settings.issueLinking ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRegex('')
              setUrl('')
              onSave({ issueLinking: null })
            }}
          >
            {translate('codezera.gitGraph.settings.removeIssueLinking', 'Remove')}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={!regex || !/^https?:\/\//i.test(url.trim())}>
          {translate('codezera.gitGraph.settings.saveIssueLinking', 'Save issue linking')}
        </Button>
      </div>
    </form>
  )
}
