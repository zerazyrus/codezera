import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import type { CkitQuotaStatus, CkitQuotaWindow } from '../../../shared/codezera/ckit-types'

export function isCkitInstalled(): boolean {
  const bin = process.platform === 'win32' ? 'ckit.exe' : 'ckit'
  return existsSync(join(homedir(), '.local', 'bin', bin))
}

// Shared with ckit/omp. Codezera writes it only when the user saves a key in Settings.
export function getCkitModelsPath(): string {
  return join(homedir(), '.omp', 'agent', 'models.yml')
}

export const CKIT_PROVIDER = 'cloudgo-cc'
export const CKIT_CLAUDE_BASE_URL = 'https://ai-gateway.cloudgo.vn/llm/claude/v1'
const REQUEST_TIMEOUT_MS = 10_000

const ModelsFile = z.object({
  providers: z.record(
    z.string(),
    z.object({ baseUrl: z.string().optional(), apiKey: z.string().optional() }).catch({})
  )
})

const QuotaResponse = z.object({
  budget_source: z.string().optional(),
  used_percent: z.number().nullish(),
  window_seconds: z.number().nullish(),
  window_reset_at: z.string().nullish(),
  exceeded: z.boolean().optional(),
  daily_budget_source: z.string().optional(),
  daily_used_percent: z.number().nullish(),
  daily_reset_at: z.string().nullish(),
  daily_exceeded: z.boolean().optional()
})

type GatewayProvider = { name: string; baseUrl: string; apiKey: string }

export function pickGatewayProvider(modelsYaml: string): GatewayProvider | null {
  const doc = ModelsFile.safeParse(parse(modelsYaml))
  if (!doc.success) {
    return null
  }
  const gateways: GatewayProvider[] = []
  for (const [name, { baseUrl, apiKey }] of Object.entries(doc.data.providers)) {
    // Only the /llm/ routes expose /quota; ckit's seeded 9router entries use the bare host with a placeholder key.
    if (baseUrl && apiKey?.trim() && baseUrl.includes('/llm/')) {
      gateways.push({ name, baseUrl, apiKey: apiKey.trim() })
    }
  }
  return gateways.find((p) => p.name === CKIT_PROVIDER) ?? gateways[0] ?? null
}

function resetTime(value: string | null | undefined): number | null {
  const ms = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(ms) ? null : ms
}

// A budget counts only when the server resolved one and reported a percentage; otherwise it is unlimited.
export function parseCkitQuota(body: unknown): CkitQuotaWindow[] {
  const q = QuotaResponse.parse(body)
  const windows: CkitQuotaWindow[] = []
  if (q.budget_source !== 'none' && q.used_percent != null) {
    windows.push({
      kind: 'window',
      windowSeconds: q.window_seconds ?? null,
      usedPercent: q.used_percent,
      exceeded: q.exceeded === true,
      resetsAt: resetTime(q.window_reset_at)
    })
  }
  if (q.daily_budget_source && q.daily_budget_source !== 'none' && q.daily_used_percent != null) {
    windows.push({
      kind: 'day',
      windowSeconds: null,
      usedPercent: q.daily_used_percent,
      exceeded: q.daily_exceeded === true,
      resetsAt: resetTime(q.daily_reset_at)
    })
  }
  return windows
}

export async function getCkitQuota(): Promise<CkitQuotaStatus> {
  const configPath = getCkitModelsPath()
  let provider: GatewayProvider | null = null
  try {
    provider = pickGatewayProvider(await readFile(configPath, 'utf8'))
  } catch {
    // Missing or malformed models.yml both mean "not set up yet".
  }
  const ckitInstalled = isCkitInstalled()
  if (!provider) {
    return { state: 'not-configured', configPath, ckitInstalled }
  }
  const { apiKey } = provider
  const base = {
    configPath,
    ckitInstalled,
    provider: provider.name,
    keyHint: apiKey.length <= 8 ? '••••' : `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
  }
  try {
    const res = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/quota`, {
      headers: { 'x-api-key': apiKey, authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!res.ok) {
      await res.body?.cancel()
      throw new Error(
        res.status === 401 || res.status === 403
          ? `Gateway rejected the key (${res.status})`
          : `Quota request failed (${res.status})`
      )
    }
    const windows = parseCkitQuota(await res.json())
    return { ...base, state: 'ok', windows, fetchedAt: Date.now() }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ...base, state: 'error', message, fetchedAt: Date.now() }
  }
}
