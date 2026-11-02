import { useMemo } from 'react'
import { ServerCog } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ActivityBarItem } from '@/components/right-sidebar/activity-bar-buttons'
import { useSftpWorkspacePath } from './sftp-store'

/** Right-sidebar SFTP tab, present for every workspace on this computer. */
export function useSftpActivityItems(worktreeId: string | null): ActivityBarItem[] {
  const isLocal = useSftpWorkspacePath(worktreeId) !== null
  return useMemo(
    () =>
      isLocal
        ? [
            {
              id: 'sftp',
              icon: ServerCog,
              title: translate('codezera.sftp.title', 'SFTP'),
              shortcut: ''
            }
          ]
        : [],
    [isLocal]
  )
}
