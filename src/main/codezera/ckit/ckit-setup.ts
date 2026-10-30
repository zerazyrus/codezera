import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { Document, isMap, parseDocument } from 'yaml'
import { z } from 'zod'
import { CKIT_CLAUDE_BASE_URL, CKIT_PROVIDER, getCkitModelsPath } from './ckit-quota'

const REQUEST_TIMEOUT_MS = 15_000
const PREFERRED_DEFAULT_MODELS = ['claude-sonnet-5', 'claude-opus-5-5', 'claude-opus-4-8']
const CHEAP_MODEL = 'claude-haiku-4-5-20251001'
// The /llm/ routes only; ckit's seeded 9router entries sit on the bare host with a placeholder key.
const CKIT_GATEWAY_ORIGIN = 'https://ai-gateway.cloudgo.vn/llm/'

function getOmpConfigPath(): string {
  return join(homedir(), '.omp', 'agent', 'config.yml')
}

const ModelsResponse = z.object({
  data: z.array(z.object({ id: z.string(), max_input_tokens: z.number().optional() }))
})

type GatewayModel = { id: string; contextWindow: number }

async function gatewayGet(path: string, apiKey: string): Promise<Response> {
  return fetch(`${CKIT_CLAUDE_BASE_URL}${path}`, {
    headers: { 'x-api-key': apiKey, authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
}

/** Proves the key works (quota is per key) and returns the Claude models the gateway serves. */
async function verifyKey(apiKey: string): Promise<GatewayModel[]> {
  const quota = await gatewayGet('/quota', apiKey)
  await quota.body?.cancel()
  if (quota.status === 401 || quota.status === 403) {
    throw new Error('The gateway rejected this key. Check it and try again.')
  }
  if (!quota.ok) {
    throw new Error(`Could not verify the key (gateway answered ${quota.status}).`)
  }
  const models = await gatewayGet('/models', apiKey)
  if (!models.ok) {
    await models.body?.cancel()
    throw new Error(`Could not list gateway models (${models.status}).`)
  }
  // "[1m]" ids are context-size aliases of the same model.
  return ModelsResponse.parse(await models.json())
    .data.filter((m) => !m.id.includes('['))
    .map((m) => ({ id: m.id, contextWindow: m.max_input_tokens ?? 200_000 }))
}

// Mirrors the cloudgo-cc block ckit users run today; budget-effort thinking is what the gateway accepts.
function providerModelEntry(model: GatewayModel): Record<string, unknown> {
  const cheap = model.id.includes('haiku')
  return {
    id: model.id,
    name: model.id,
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: model.contextWindow,
    maxTokens: cheap ? 64_000 : 128_000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    thinking: {
      mode: 'anthropic-budget-effort',
      efforts: ['minimal', 'low', 'medium', 'high'],
      defaultLevel: cheap ? 'minimal' : 'medium'
    }
  }
}

async function readDocument(path: string): Promise<Document> {
  const text = existsSync(path) ? await readFile(path, 'utf8') : ''
  const doc = parseDocument(text)
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) {
    throw new Error(`${path} is not valid YAML; fix it or remove it, then try again.`)
  }
  return doc.contents === null ? new Document({}) : doc
}

async function writeDocument(path: string, doc: Document): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  if (existsSync(path)) {
    await copyFile(path, `${path}.codezera-bak`)
  }
  // No padding inside [] / {} so a key rotation leaves ckit's file otherwise byte-identical.
  await writeFile(path, doc.toString({ flowCollectionPadding: false }), {
    encoding: 'utf8',
    mode: 0o600
  })
}

/** Existing gateway providers (cloudgo-cc, cloudgo-cx, …) keep their tuned models; only the key rotates. */
async function saveProvider(apiKey: string, models: GatewayModel[]): Promise<void> {
  const path = getCkitModelsPath()
  const doc = await readDocument(path)
  const parsed = z
    .object({
      providers: z.record(z.string(), z.object({ baseUrl: z.string() }).catch({ baseUrl: '' }))
    })
    .safeParse(doc.toJS())
  const gatewayProviders = Object.entries(parsed.success ? parsed.data.providers : {})
    .filter(([, conf]) => conf.baseUrl.startsWith(CKIT_GATEWAY_ORIGIN))
    .map(([name]) => name)
  for (const name of gatewayProviders) {
    doc.setIn(['providers', name, 'apiKey'], apiKey)
  }
  if (!gatewayProviders.includes(CKIT_PROVIDER)) {
    doc.setIn(
      ['providers', CKIT_PROVIDER],
      doc.createNode({
        baseUrl: CKIT_CLAUDE_BASE_URL,
        apiKey,
        api: 'anthropic-messages',
        authHeader: true,
        models: models.map(providerModelEntry)
      })
    )
  }
  await writeDocument(path, doc)
}

// ckit setup seeds roles on its 9router catalog, which this gateway does not serve; point those
// (and a missing default) at cloudgo-cc so omp works right after the key is saved.
async function routeModelRoles(models: GatewayModel[]): Promise<void> {
  const ids = new Set(models.map((m) => m.id))
  const fallback = PREFERRED_DEFAULT_MODELS.find((id) => ids.has(id)) ?? models[0]?.id
  if (!fallback) {
    return
  }
  const path = getOmpConfigPath()
  const doc = await readDocument(path)
  const parsed = z
    .object({ modelRoles: z.record(z.string(), z.unknown()).optional() })
    .safeParse(doc.toJS())
  const entries = Object.entries(parsed.success ? (parsed.data.modelRoles ?? {}) : {}).flatMap(
    ([role, value]) => (typeof value === 'string' ? [[role, value] as const] : [])
  )
  let changed = false
  for (const [role, value] of entries) {
    if (!value.startsWith('9router-')) {
      continue
    }
    const [selector, effort] = value.split(':')
    const model = selector.split('/').at(-1) ?? ''
    const target = ids.has(model)
      ? model
      : selector.startsWith('9router-cx') && ids.has(CHEAP_MODEL)
        ? CHEAP_MODEL
        : fallback
    doc.setIn(['modelRoles', role], `${CKIT_PROVIDER}/${target}${effort ? `:${effort}` : ''}`)
    changed = true
  }
  if (!entries.some(([role]) => role === 'default')) {
    doc.setIn(['modelRoles', 'default'], `${CKIT_PROVIDER}/${fallback}`)
    changed = true
  }
  if (changed) {
    await writeDocument(path, doc)
  }
}

export async function saveCkitApiKey(rawKey: unknown): Promise<void> {
  if (typeof rawKey !== 'string' || !rawKey.trim()) {
    throw new Error('Enter your CloudGO gateway API key.')
  }
  const apiKey = rawKey.trim()
  const models = await verifyKey(apiKey)
  await saveProvider(apiKey, models)
  await routeModelRoles(models)
}
