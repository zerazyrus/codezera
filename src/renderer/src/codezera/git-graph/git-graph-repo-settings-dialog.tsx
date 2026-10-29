import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getConnectionId } from '@/lib/connection-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type {
  GitGraphAction,
  GitGraphBranch,
  GitGraphRepoInfo,
  GitGraphRepoSettings
} from '../../../../shared/codezera/git-graph-types'
import { useGitGraphStore } from './git-graph-store'
import { GitGraphRemotesSection } from './git-graph-remotes-section'
import {
  GitGraphIssueLinkingSection,
  GitGraphUserSection
} from './git-graph-repo-settings-sections'

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="border-b border-border pb-1 text-sm font-bold">{title}</h3>
      {children}
    </section>
  )
}

function OptionCheckbox({
  checked,
  label,
  onChange
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <Label className="flex items-center gap-2 text-[13px] font-normal">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      {label}
    </Label>
  )
}

export function GitGraphRepoSettingsDialog({
  open,
  onOpenChange,
  repoId,
  repoName,
  worktreeId,
  worktreePath,
  settings,
  selectedRefs,
  branches,
  onRun
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoId: string
  repoName: string
  worktreeId: string
  worktreePath: string
  settings: GitGraphRepoSettings
  selectedRefs: string[] | null
  branches: GitGraphBranch[]
  onRun: (action: GitGraphAction) => Promise<boolean>
}): React.JSX.Element {
  const saveRepoSettings = useGitGraphStore((s) => s.saveRepoSettings)
  const [info, setInfo] = useState<GitGraphRepoInfo | null>(null)
  const [busy, setBusy] = useState(false)

  const loadInfo = useCallback(async (): Promise<void> => {
    try {
      setInfo(
        await window.api.codezera.gitGraph.repoInfo({
          worktreePath,
          connectionId: getConnectionId(worktreeId) ?? undefined
        })
      )
    } catch (error) {
      toast.error(
        translate('codezera.gitGraph.settings.loadFailed', 'Could not read repository settings'),
        {
          description: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }, [worktreeId, worktreePath])

  useEffect(() => {
    if (open) {
      void loadInfo()
    }
  }, [loadInfo, open])

  const run = async (action: GitGraphAction): Promise<boolean> => {
    setBusy(true)
    const ok = await onRun(action)
    await loadInfo()
    setBusy(false)
    return ok
  }

  const update = (patch: Partial<GitGraphRepoSettings>): void => {
    saveRepoSettings(repoId, { ...settings, ...patch }).then(
      () =>
        toast.success(translate('codezera.gitGraph.settings.saved', 'Repository settings saved')),
      (error: unknown) =>
        toast.error(
          translate('codezera.gitGraph.settings.saveFailed', 'Could not save repository settings'),
          {
            description: error instanceof Error ? error.message : String(error)
          }
        )
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="scrollbar-sleek max-h-[85vh] overflow-y-auto text-[13px] sm:max-w-3xl"
        data-testid="git-graph-settings"
      >
        <DialogHeader>
          <DialogTitle>
            {translate('codezera.gitGraph.settings.title', 'Repository Settings')}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {repoName}
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <Section title={translate('codezera.gitGraph.settings.user', 'User Details')}>
            <GitGraphUserSection info={info} busy={busy} onRun={run} />
          </Section>
          <Section title={translate('codezera.gitGraph.settings.graph', 'Graph')}>
            <OptionCheckbox
              checked={settings.showStashes}
              label={translate('codezera.gitGraph.settings.showStashes', 'Show stashes')}
              onChange={(showStashes) => update({ showStashes })}
            />
            <OptionCheckbox
              checked={settings.showTags}
              label={translate('codezera.gitGraph.settings.showTags', 'Show tags')}
              onChange={(showTags) => update({ showTags })}
            />
            <OptionCheckbox
              checked={settings.includeReflogs}
              label={translate(
                'codezera.gitGraph.settings.includeReflogs',
                'Include commits only mentioned by reflogs'
              )}
              onChange={(includeReflogs) => update({ includeReflogs })}
            />
            <OptionCheckbox
              checked={settings.firstParentOnly}
              label={translate(
                'codezera.gitGraph.settings.firstParent',
                'Only follow the first parent of commits'
              )}
              onChange={(firstParentOnly) => update({ firstParentOnly })}
            />
          </Section>
          <Section
            title={translate(
              'codezera.gitGraph.settings.initialBranches',
              'Branches shown when opened'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate" data-testid="git-graph-settings-initial">
                {settings.initialBranches
                  ? settings.initialBranches
                      .map((ref) => branches.find((branch) => branch.fullName === ref)?.name ?? ref)
                      .join(', ')
                  : translate('codezera.gitGraph.settings.allBranches', 'Show All')}
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={!selectedRefs}
                onClick={() => update({ initialBranches: selectedRefs })}
              >
                {translate('codezera.gitGraph.settings.useSelection', 'Use current selection')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!settings.initialBranches}
                onClick={() => update({ initialBranches: null })}
              >
                {translate('codezera.gitGraph.settings.showAll', 'Show all')}
              </Button>
            </div>
          </Section>
          <Section title={translate('codezera.gitGraph.settings.remotes', 'Remote Configuration')}>
            <GitGraphRemotesSection
              remotes={info?.remotes ?? []}
              hiddenRemotes={settings.hiddenRemotes}
              busy={busy}
              onToggleHidden={(name) =>
                update({
                  hiddenRemotes: settings.hiddenRemotes.includes(name)
                    ? settings.hiddenRemotes.filter((remote) => remote !== name)
                    : [...settings.hiddenRemotes, name]
                })
              }
              onRun={run}
            />
          </Section>
          <Section title={translate('codezera.gitGraph.settings.issueLinking', 'Issue Linking')}>
            <GitGraphIssueLinkingSection settings={settings} onSave={update} />
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
