import { create } from 'zustand'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { isWebClientLocation } from '@/lib/web-client-location'
import type {
  PmsAccountInput,
  PmsItem,
  PmsItemKind,
  PmsStatus,
  PmsStatusOption,
  PmsUser
} from '../../../../shared/codezera/pms-types'

// Credentials live in this computer's keychain; paired web clients cannot reach them.
export const pmsAvailable = (): boolean => !isPairedWebClientWindow() && !isWebClientLocation()

/** IPC prefixes main-process errors; keep only the reason. */
export function pmsErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Local calendar day as PMS stores it (YYYY-MM-DD). */
export function pmsToday(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 7.75 → "7h45", 8 → "8h". */
export function pmsFormatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

const TASK_PAGE_ACTIVE_KEY = 'codezera.pms.taskPageActive'
const VIEW_OTHERS_KEY = 'codezera.pms.viewOthers'
/** `viewAs` value showing every employee's work. */
export const PMS_ALL_EMPLOYEES = 'all'

/** A choice saved in localStorage, or the fallback when it is absent or no longer offered. */
export function storedChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  const saved = localStorage.getItem(key)
  return choices.find((choice) => choice === saved) ?? fallback
}

export type PmsListView = 'queue' | PmsItemKind | 'report'
/** What another surface (status bar) asks the PMS page to show once it is open. */
export type PmsOpenRequest = { view?: PmsListView; item?: PmsItem }

type PmsStore = {
  status: PmsStatus | null
  loadingStatus: boolean
  statusOptions: Partial<Record<PmsItemKind, PmsStatusOption[]>>
  todayHours: number | null
  /** PMS users for the missing-field form, loaded once. */
  users: PmsUser[] | null
  loadUsers: () => Promise<void>
  /** Settings switch: the lists offer other employees' work, not only the user's. */
  viewOthers: boolean
  setViewOthers: (enabled: boolean) => void
  /** Whose work the lists show: empty is the user, an employee id, or `PMS_ALL_EMPLOYEES`. */
  viewAs: string
  setViewAs: (viewAs: string) => void
  /** PMS is the selected source on the Tasks page (Orca's own source stays as it was). */
  taskPageActive: boolean
  setTaskPageActive: (active: boolean) => void
  openRequest: PmsOpenRequest | null
  setOpenRequest: (request: PmsOpenRequest | null) => void
  loadStatus: () => Promise<void>
  connect: (input: PmsAccountInput) => Promise<void>
  connectFromSkillConfig: () => Promise<void>
  disconnect: () => Promise<void>
  loadStatusOptions: (kind: PmsItemKind) => Promise<void>
  refreshTodayHours: () => Promise<void>
}

export const usePmsStore = create<PmsStore>()((set, get) => ({
  status: null,
  loadingStatus: false,
  statusOptions: {},
  todayHours: null,
  users: null,
  loadUsers: async () => {
    if (!get().users) {
      set({ users: await window.api.codezera.pms.users() })
    }
  },
  viewOthers: typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_OTHERS_KEY) === '1',
  setViewOthers: (enabled) => {
    localStorage.setItem(VIEW_OTHERS_KEY, enabled ? '1' : '0')
    set(enabled ? { viewOthers: true } : { viewOthers: false, viewAs: '' })
  },
  viewAs: '',
  setViewAs: (viewAs) => set({ viewAs }),
  // The status bar imports this store, and its tests run without a DOM storage.
  taskPageActive:
    typeof localStorage !== 'undefined' && localStorage.getItem(TASK_PAGE_ACTIVE_KEY) === '1',
  setTaskPageActive: (active) => {
    localStorage.setItem(TASK_PAGE_ACTIVE_KEY, active ? '1' : '0')
    set({ taskPageActive: active })
  },
  openRequest: null,
  setOpenRequest: (request) => set({ openRequest: request }),
  loadStatus: async () => {
    if (!pmsAvailable() || get().loadingStatus) {
      return
    }
    set({ loadingStatus: true })
    try {
      set({ status: await window.api.codezera.pms.getStatus() })
    } finally {
      set({ loadingStatus: false })
    }
  },
  connect: async (input) => {
    set({
      status: await window.api.codezera.pms.connect(input),
      statusOptions: {},
      viewAs: ''
    })
  },
  connectFromSkillConfig: async () => {
    set({
      status: await window.api.codezera.pms.connectFromSkillConfig(),
      statusOptions: {},
      viewAs: ''
    })
  },
  disconnect: async () => {
    set({
      status: await window.api.codezera.pms.disconnect(),
      statusOptions: {},
      todayHours: null,
      viewAs: ''
    })
  },
  loadStatusOptions: async (kind) => {
    if (get().statusOptions[kind]) {
      return
    }
    const options = await window.api.codezera.pms.statusOptions(kind)
    set((s) => ({ statusOptions: { ...s.statusOptions, [kind]: options } }))
  },
  refreshTodayHours: async () => {
    set({ todayHours: await window.api.codezera.pms.loggedHours(pmsToday()) })
  }
}))
