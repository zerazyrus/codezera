export type CkitQuotaWindow = {
  kind: 'window' | 'day'
  /** Refill period of the rolling bucket; null for the calendar day. */
  windowSeconds: number | null
  usedPercent: number
  exceeded: boolean
  resetsAt: number | null
}

export type CkitQuotaStatus =
  | { state: 'not-configured'; configPath: string; ckitInstalled: boolean }
  | {
      state: 'ok'
      configPath: string
      ckitInstalled: boolean
      provider: string
      keyHint: string
      /** Empty when the key has no budget (unlimited). */
      windows: CkitQuotaWindow[]
      fetchedAt: number
    }
  | {
      state: 'error'
      configPath: string
      ckitInstalled: boolean
      provider: string
      keyHint: string
      message: string
      fetchedAt: number
    }

export type CkitApi = {
  getQuota: () => Promise<CkitQuotaStatus>
  /** Verifies the key against the gateway, then writes it into the omp config ckit uses. */
  saveApiKey: (apiKey: string) => Promise<CkitQuotaStatus>
}
