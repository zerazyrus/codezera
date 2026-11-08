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

export type CkitTool = 'ckit' | 'omp'

export type CkitToolUpdate = { tool: CkitTool; current: string; latest: string }

export type CkitToolUpdateResult = { ok: true } | { ok: false; tool: CkitTool; output: string }

export type CkitApi = {
  getQuota: () => Promise<CkitQuotaStatus>
  /** Verifies the key against the gateway, then writes it plus the team omp settings into the config ckit uses. */
  saveApiKey: (apiKey: string, options: { autoApprove: boolean }) => Promise<CkitQuotaStatus>
  /** Installed ckit/omp builds that have a newer release; empty when current, missing or offline. */
  checkToolUpdates: () => Promise<CkitToolUpdate[]>
  /** Runs `ckit up` / `omp update` for the given tools, stopping at the first failure. */
  runToolUpdates: (tools: CkitTool[]) => Promise<CkitToolUpdateResult>
}
