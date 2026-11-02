import { useState } from 'react'
import { Download, MoreHorizontal, Pencil, Plus, ServerCog, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type {
  SftpConnectionProfile,
  SftpWorkspaceConnections
} from '../../../../shared/codezera/sftp-types'
import { sftpErrorText } from './sftp-actions'
import { SftpConnectionDialog } from './sftp-connection-dialog'
import { importSftpFromVsCode } from './sftp-import-feedback'
import { useSftpStore } from './sftp-store'

type Confirmation = {
  title: string
  description: string
  action: string
  destructive: boolean
  run: () => Promise<void>
}

function ConfirmDialog({
  confirmation,
  onClose
}: {
  confirmation: Confirmation | null
  onClose: () => void
}): React.JSX.Element {
  return (
    <Dialog open={confirmation !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-base">{confirmation?.title}</DialogTitle>
          <DialogDescription>{confirmation?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {translate('codezera.sftp.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={confirmation?.destructive ? 'destructive' : 'default'}
            onClick={() => {
              onClose()
              void confirmation?.run()
            }}
          >
            {confirmation?.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Panel shown when a workspace has no Codezera SFTP config yet. */
export function SftpEmptyState({
  workspacePath,
  hasVsCodeConfig
}: {
  workspacePath: string
  hasVsCodeConfig: boolean
}): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
      <ServerCog className="size-8 opacity-50" />
      <p className="text-xs">
        {translate(
          'codezera.sftp.emptyBody',
          'Connect this workspace to a server folder to browse, upload, download and diff files over SFTP.'
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" size="xs" className="gap-1" onClick={() => setAdding(true)}>
          <Plus className="size-3" />
          {translate('codezera.sftp.addConnection', 'Add connection')}
        </Button>
        {hasVsCodeConfig && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="gap-1"
            disabled={importing}
            onClick={() => {
              setImporting(true)
              void importSftpFromVsCode(workspacePath).finally(() => setImporting(false))
            }}
          >
            <Download className="size-3" />
            {translate('codezera.sftp.importVsCode', 'Import from VS Code')}
          </Button>
        )}
      </div>
      <SftpConnectionDialog
        open={adding}
        onOpenChange={setAdding}
        workspacePath={workspacePath}
        profile={null}
        profileNames={[]}
      />
    </div>
  )
}

/** Add / Edit / Delete profile and re-import, for a workspace that has a config. */
export function SftpProfileMenu({
  workspacePath,
  connections,
  hasVsCodeConfig
}: {
  workspacePath: string
  connections: SftpWorkspaceConnections
  hasVsCodeConfig: boolean
}): React.JSX.Element {
  const [editing, setEditing] = useState<{ profile: SftpConnectionProfile | null } | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const active =
    connections.profiles.find((profile) => profile.name === connections.activeProfile) ??
    connections.profiles[0]!
  const profileNames = connections.profiles.map((profile) => profile.name)

  const deleteActive = async (): Promise<void> => {
    try {
      const state = await window.api.codezera.sftp.deleteProfile({
        workspacePath,
        profile: active.name
      })
      useSftpStore.getState().apply(workspacePath, state)
    } catch (error) {
      toast.error(translate('codezera.sftp.deleteFailed', 'Could not delete the profile'), {
        description: sftpErrorText(error)
      })
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            aria-label={translate('codezera.sftp.profileMenu', 'Manage profiles')}
          >
            <MoreHorizontal className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing({ profile: null })}>
            <Plus />
            {translate('codezera.sftp.addProfile', 'Add profile')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditing({ profile: active })}>
            <Pencil />
            {translate('codezera.sftp.editProfile', 'Edit profile "{{name}}"', {
              name: active.name
            })}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              setConfirmation({
                title: translate('codezera.sftp.deleteTitle', 'Delete profile "{{name}}"?', {
                  name: active.name
                }),
                description: translate(
                  'codezera.sftp.deleteDescription',
                  'Only the Codezera profile is removed; files and the SSH host stay.'
                ),
                action: translate('codezera.sftp.delete', 'Delete'),
                destructive: true,
                run: deleteActive
              })
            }
          >
            <Trash2 />
            {translate('codezera.sftp.deleteProfile', 'Delete profile')}
          </DropdownMenuItem>
          {hasVsCodeConfig && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  setConfirmation({
                    title: translate('codezera.sftp.reimportTitle', 'Import again from VS Code?'),
                    description: translate(
                      'codezera.sftp.reimportDescription',
                      "This replaces all of this workspace's SFTP profiles with the ones in .vscode/sftp.json."
                    ),
                    action: translate('codezera.sftp.importVsCode', 'Import from VS Code'),
                    destructive: false,
                    run: () => importSftpFromVsCode(workspacePath)
                  })
                }
              >
                <Download />
                {translate('codezera.sftp.importVsCode', 'Import from VS Code')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SftpConnectionDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        workspacePath={workspacePath}
        profile={editing?.profile ?? null}
        profileNames={profileNames}
      />
      <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </>
  )
}
