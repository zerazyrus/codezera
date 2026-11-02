import { useMemo } from 'react'
import { ServerCog } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ActivityBarItem } from '@/components/right-sidebar/activity-bar-buttons'
import { useSftpState, useSftpWorkspacePath } from './sftp-store'

/** Right-sidebar SFTP tab, present only for local workspaces that have a `.vscode/sftp.json`. */
export function useSftpActivityItems(worktreeId: string | null): ActivityBarItem[] {
  const state = useSftpState(useSftpWorkspacePath(worktreeId))
  const hasConfig = state !== undefined && state.status !== 'missing'
  return useMemo(
    () =>
      hasConfig
        ? [
            {
              id: 'sftp',
              icon: ServerCog,
              title: translate('codezera.sftp.title', 'SFTP'),
              shortcut: ''
            }
          ]
        : [],
    [hasConfig]
  )
}
