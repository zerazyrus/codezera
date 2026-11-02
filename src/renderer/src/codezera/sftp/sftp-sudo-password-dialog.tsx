import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function SudoPasswordDialog({
  account,
  wrong,
  onDone
}: {
  account: string
  wrong: boolean
  onDone: (password: string | null) => void
}): React.JSX.Element {
  const [password, setPassword] = useState('')
  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && onDone(null)}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {translate('codezera.sftp.sudoPasswordTitle', 'Sudo password for {{account}}', {
              account
            })}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'codezera.sftp.sudoPasswordNote',
              'Kept only until Codezera quits; never saved to disk.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (password) {
              onDone(password)
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sftp-sudo-password">
              {translate('codezera.sftp.sudoPasswordLabel', 'Password')}
            </Label>
            <Input
              id="sftp-sudo-password"
              type="password"
              autoComplete="off"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {wrong && (
              <p className="text-xs text-destructive">
                {translate('codezera.sftp.sudoPasswordWrong', 'Wrong password, try again.')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onDone(null)}>
              {translate('codezera.sftp.cancel', 'Cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!password}>
              {translate('codezera.sftp.sudoPasswordSubmit', 'Upload')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

let openPrompt: Promise<string | null> | null = null

/**
 * Asks for the login user's sudo password; null when cancelled. Uploads that fail together
 * (e.g. several saves) share one dialog. Mounted on demand: uploads also start outside the panel.
 */
export function promptSudoPassword(account: string, wrong: boolean): Promise<string | null> {
  if (openPrompt) {
    return openPrompt
  }
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  const { promise, resolve } = Promise.withResolvers<string | null>()
  let settled = false
  const done = (password: string | null): void => {
    if (settled) {
      return
    }
    settled = true
    openPrompt = null
    // Unmounting inside the dialog's own event handler makes React warn; do it right after.
    setTimeout(() => {
      root.unmount()
      container.remove()
    })
    resolve(password)
  }
  root.render(<SudoPasswordDialog account={account} wrong={wrong} onDone={done} />)
  openPrompt = promise
  return promise
}
