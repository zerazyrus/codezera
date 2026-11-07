import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/workspaces/selection/use-selected-worktree'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PmsPicker } from './pms-picker'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import type {
  PmsFormField,
  PmsItemDetail,
  PmsStatusOption
} from '../../../../shared/codezera/pms-types'
import {
  pmsProjectRepo,
  rememberPmsProjectRepo,
  startPmsInMainCheckout,
  startPmsWorktree
} from './pms-agent-launch'
import { PmsFieldForm, pmsFieldsFilled } from './pms-field-form'
import { pmsErrorText } from './pms-store'
import { pmsAgentPrompt, pmsBranchName, pmsWorkspaceName } from './pms-workspace-link'

type WorkPlace = 'worktree' | 'main' | 'none'

/**
 * "Start" on a ticket, the `/pms ticket take` flow: In Progress, Người xử lý = me, a linked
 * ProjectTask, then an agent on the ticket either in a new git-flow worktree or in the repo's own
 * checkout (some fixes must be made on master directly).
 */
export function PmsTakePanel({
  detail,
  onTaken,
  onClose
}: {
  detail: PmsItemDetail
  onTaken: (next: PmsItemDetail) => void
  onClose: () => void
}): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useActiveWorktree()?.repoId ?? null
  const [place, setPlace] = useState<WorkPlace>('worktree')
  const [repoId, setRepoId] = useState<string>(
    () => pmsProjectRepo(detail.projectId) ?? activeRepoId ?? repos[0]?.id ?? ''
  )
  const [branch, setBranch] = useState(() => pmsBranchName(detail, detail.category))
  const [createTask, setCreateTask] = useState(true)
  const [fields, setFields] = useState<PmsFormField[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [taskTypes, setTaskTypes] = useState<PmsStatusOption[] | null>(null)
  const [taskType, setTaskType] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const repoChoices = place === 'worktree' ? repos.filter(isGitRepoKind) : repos
  const ready =
    !busy &&
    pmsFieldsFilled(fields, values) &&
    (taskTypes === null || taskType !== '') &&
    (place === 'none' || (repoChoices.some((repo) => repo.id === repoId) && branch.trim() !== ''))

  const launch = async (taken: PmsItemDetail): Promise<void> => {
    if (place === 'none') {
      return
    }
    rememberPmsProjectRepo(detail.projectId, repoId)
    const prompt = pmsAgentPrompt(taken)
    if (place === 'main') {
      await startPmsInMainCheckout({ repoId, prompt })
      return
    }
    await startPmsWorktree({
      repoId,
      name: pmsWorkspaceName(taken),
      displayName: `${taken.number} ${taken.title}`.trim(),
      branch: branch.trim(),
      prompt
    })
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      let taken = detail
      if (detail.kind === 'ticket') {
        const result = await window.api.codezera.pms.takeTicket({
          ticketId: detail.id,
          fields: values,
          taskType: taskType || null,
          createTask
        })
        if (result.needs === 'fields') {
          setFields(result.fields)
          return
        }
        if (result.needs === 'taskType') {
          setTaskTypes(result.options)
          return
        }
        taken = result.detail
        onTaken(taken)
      } else if (detail.status !== 'In Progress') {
        taken = await window.api.codezera.pms.setStatus({
          kind: 'task',
          id: detail.id,
          status: 'In Progress'
        })
        onTaken(taken)
      }
      await launch(taken)
      toast.success(translate('codezera.pms.taken', 'Started {{item}}', { item: taken.number }))
      onClose()
    } catch (err) {
      setError(pmsErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-[13px]"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex gap-1">
        {(
          [
            ['worktree', translate('codezera.pms.placeWorktree', 'New worktree')],
            ['main', translate('codezera.pms.placeMain', 'Main checkout')],
            ['none', translate('codezera.pms.placeNone', 'No workspace')]
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={place === value ? 'secondary' : 'ghost'}
            className="flex-1"
            onClick={() => setPlace(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {place !== 'none' ? (
        <>
          <PmsPicker
            value={repoId}
            onChange={setRepoId}
            placeholder={translate('codezera.pms.pickRepo', 'Choose a project')}
            options={repoChoices.map((repo) => ({ value: repo.id, label: repo.displayName }))}
            className="w-full"
          />
          {place === 'worktree' ? (
            <Input
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              aria-label={translate('codezera.pms.branch', 'Branch')}
              className="h-8 font-mono text-[13px]"
            />
          ) : (
            <p className="text-muted-foreground">
              {translate(
                'codezera.pms.mainHint',
                'The agent works in the project folder on its current branch.'
              )}
            </p>
          )}
        </>
      ) : null}
      {detail.kind === 'ticket' ? (
        <label className="flex items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={createTask}
            onChange={(event) => setCreateTask(event.target.checked)}
          />
          {translate('codezera.pms.createTask', 'Create a linked task to log time on')}
        </label>
      ) : null}
      {taskTypes ? (
        <PmsPicker
          value={taskType}
          onChange={setTaskType}
          placeholder={translate('codezera.pms.taskType', 'Task type')}
          options={taskTypes}
          className="w-full"
        />
      ) : null}
      {fields.length > 0 ? (
        <PmsFieldForm fields={fields} values={values} onChange={setValues} ticketUrl={detail.url} />
      ) : null}
      {error ? <p className="break-words text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {translate('codezera.pms.cancel', 'Cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={!ready}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {translate('codezera.pms.start', 'Start')}
        </Button>
      </div>
    </form>
  )
}
