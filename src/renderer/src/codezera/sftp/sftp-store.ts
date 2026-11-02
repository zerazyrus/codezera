import { useEffect } from 'react'
import { create } from 'zustand'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { runtimeTargetForWorkspaceOwner } from '@/lib/resolve-owner'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { SftpConfigState } from '../../../../shared/codezera/sftp-types'

export type SftpWorkspace = { worktreeId: string; workspacePath: string }

type SftpStore = {
  /** Keyed by workspace path. */
  states: Record<string, SftpConfigState | undefined>
  /** Bumped when sftp.json changes, so open remote trees reload. */
  revisions: Record<string, number>
  load: (workspacePath: string) => Promise<SftpConfigState | null>
  setProfile: (workspacePath: string, profile: string) => Promise<void>
}

// sftp.json and the SSH keys live on this computer; paired web clients cannot reach them.
export const sftpAvailable = (): boolean => !isPairedWebClientWindow() && !isWebClientLocation()

let configWatchInstalled = false

export const useSftpStore = create<SftpStore>()((set, get) => ({
  states: {},
  revisions: {},
  load: async (workspacePath) => {
    if (!sftpAvailable()) {
      return null
    }
    if (!configWatchInstalled) {
      configWatchInstalled = true
      window.api.codezera.sftp.onConfigChanged((changedPath) => {
        set((s) => ({
          revisions: { ...s.revisions, [changedPath]: (s.revisions[changedPath] ?? 0) + 1 }
        }))
        void get().load(changedPath)
      })
    }
    let state: SftpConfigState
    try {
      state = await window.api.codezera.sftp.getState({ workspacePath })
    } catch (error) {
      state = {
        status: 'invalid',
        configPath: workspacePath,
        error: error instanceof Error ? error.message : String(error)
      }
    }
    set((s) => ({ states: { ...s.states, [workspacePath]: state } }))
    return state
  },
  setProfile: async (workspacePath, profile) => {
    const state = await window.api.codezera.sftp.setProfile({ workspacePath, profile })
    set((s) => ({
      states: { ...s.states, [workspacePath]: state },
      revisions: { ...s.revisions, [workspacePath]: (s.revisions[workspacePath] ?? 0) + 1 }
    }))
  }
}))

/** Path of a worktree that lives on this computer; SSH/runtime workspaces have no local sftp.json. */
function localWorkspacePath(state: AppState, worktreeId: string | null | undefined): string | null {
  if (!worktreeId) {
    return null
  }
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (
    !worktree?.path ||
    getConnectionIdFromState(state, worktreeId) !== null ||
    runtimeTargetForWorkspaceOwner(state, { workspaceId: worktreeId })?.kind !== 'local'
  ) {
    return null
  }
  return worktree.path
}

/** Workspace path of a local worktree, or null; primitive so subscribers rerender only on change. */
export function useSftpWorkspacePath(worktreeId: string | null | undefined): string | null {
  return useAppStore((s) => localWorkspacePath(s, worktreeId))
}

/** Loads (once per path) and returns the workspace's sftp.json state. */
export function useSftpState(workspacePath: string | null): SftpConfigState | undefined {
  const state = useSftpStore((s) => (workspacePath ? s.states[workspacePath] : undefined))
  const known = state !== undefined
  useEffect(() => {
    if (workspacePath && !known) {
      void useSftpStore.getState().load(workspacePath)
    }
  }, [workspacePath, known])
  return state
}
