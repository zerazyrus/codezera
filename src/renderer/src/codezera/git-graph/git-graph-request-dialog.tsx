import type React from 'react'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { GitGraphAction } from '../../../../shared/codezera/git-graph-types'
import type { GitGraphRequest } from './git-graph-request'

type DialogRequest = Exclude<GitGraphRequest, { kind: 'run' }>

export function GitGraphRequestDialog({
  request,
  onClose,
  onRun
}: {
  request: DialogRequest | null
  onClose: () => void
  onRun: (action: GitGraphAction) => Promise<boolean>
}): React.JSX.Element {
  const [branchName, setBranchName] = useState('')
  const [checkout, setCheckout] = useState(true)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    setBranchName('')
    setCheckout(true)
    setRunning(false)
  }, [request])

  const action: GitGraphAction | null =
    request?.kind === 'confirm'
      ? request.action
      : request?.kind === 'createBranch' && branchName.trim()
        ? {
            kind: 'createBranch',
            name: branchName.trim(),
            startPoint: request.startPoint,
            checkout
          }
        : null

  const submit = async (): Promise<void> => {
    if (!action || running) {
      return
    }
    setRunning(true)
    if (await onRun(action)) {
      onClose()
    } else {
      setRunning(false)
    }
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => (!open && !running ? onClose() : undefined)}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {request?.kind === 'createBranch'
                ? translate('codezera.gitGraph.createBranch.title', 'Create branch')
                : request?.title}
            </DialogTitle>
            <DialogDescription>
              {request?.kind === 'createBranch'
                ? translate('codezera.gitGraph.createBranch.description', 'Starts at {{commit}}.', {
                    commit: request.startPoint.slice(0, 7)
                  })
                : request?.description}
            </DialogDescription>
          </DialogHeader>
          {request?.kind === 'createBranch' ? (
            <div className="flex flex-col gap-3">
              <Input
                autoFocus
                aria-label={translate('codezera.gitGraph.createBranch.name', 'Branch name')}
                placeholder={translate(
                  'codezera.gitGraph.createBranch.placeholder',
                  'feature/my-branch'
                )}
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
              />
              <Label className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={checkout}
                  onCheckedChange={(value) => setCheckout(value === true)}
                />
                {translate('codezera.gitGraph.createBranch.checkout', 'Check out the new branch')}
              </Label>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={running} onClick={onClose}>
              {translate('codezera.gitGraph.dialog.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              variant={
                request?.kind === 'confirm' && request.destructive ? 'destructive' : 'default'
              }
              disabled={!action || running}
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : null}
              {request?.kind === 'createBranch'
                ? translate('codezera.gitGraph.createBranch.submit', 'Create branch')
                : request?.title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
