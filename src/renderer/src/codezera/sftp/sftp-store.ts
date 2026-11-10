import { useEffect } from 'react'
import { create } from 'zustand'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getConnectionIdFromState } from '@/lib/workspace/ownership/connection-owner-resolution'
import { runtimeTargetForWorkspaceOwner } from '@/lib/workspace/ownership/resolve-owner'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { SftpConfigState } from '../../../../shared/codezera/sftp-types'

export type SftpWorkspace = { worktreeId: string; workspacePath: string }

type SftpStore = {
  /** Keyed by workspace path. */
  states: Record<string, SftpConfigState | undefined>
  /** Bumped when a workspace's config changes, so open remote trees reload. */
  revisions: Record<string, number>
  load: (workspacePath: string) => Promise<SftpConfigState | null>
  /** Stores a state returned by a config mutation. */
  apply: (workspacePath: string, state: SftpConfigState) => void
}

// The SFTP config and the SSH keys live on this computer; paired web clients cannot reach them.
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
        void get()
          .load(changedPath)
          .then(() =>
            set((s) => ({
              revisions: { ...s.revisions, [changedPath]: (s.revisions[changedPath] ?? 0) + 1 }
            }))
          )
      })
    }
    let state: SftpConfigState
    try {
      state = await window.api.codezera.sftp.getState({ workspacePath })
    } catch (error) {
      state = { status: 'invalid', error: error instanceof Error ? error.message : String(error) }
    }
    set((s) => ({ states: { ...s.states, [workspacePath]: state } }))
    return state
  },
  apply: (workspacePath, state) => {
    set((s) => ({ states: { ...s.states, [workspacePath]: state } }))
  }
}))

/** Path of a worktree that lives on this computer; SSH/runtime workspaces cannot use SFTP. */
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
  return useAppStore((s) => (sftpAvailable() ? localWorkspacePath(s, worktreeId) : null))
}

/** Loads (once per path) and returns the workspace's SFTP config state. */
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

function isInside(root: string, path: string): boolean {
  return path === root || (path.startsWith(root) && /^[\\/]/.test(path.slice(root.length)))
}

/** Workspace path whose loaded SFTP config covers `path`, or null. */
export function findSftpWorkspacePathFor(states: SftpStore['states'], path: string): string | null {
  for (const [key, state] of Object.entries(states)) {
    if (state?.status === 'ok' && isInside(state.summary.localRoot, path)) {
      return key
    }
  }
  return null
}

/** Loads the worktree's SFTP config once, so menus work before the SFTP tab is opened. */
export function ensureSftpStateLoaded(worktreeId: string | null | undefined): void {
  const workspacePath = localWorkspacePath(useAppStore.getState(), worktreeId)
  if (workspacePath && sftpAvailable() && !useSftpStore.getState().states[workspacePath]) {
    void useSftpStore.getState().load(workspacePath)
  }
}
