import { createHash } from 'node:crypto'
import type { PmsAccount } from './pms-account-store'
import type { PmsRecord } from './pms-records'

const REQUEST_TIMEOUT_MS = 30_000

export type PmsCloudWorkRequest = {
  RequestAction: string
  Module?: string
  Params?: PmsRecord
  Data?: PmsRecord
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
}

async function readJson(response: Response, what: string): Promise<PmsRecord> {
  const text = await response.text()
  try {
    return JSON.parse(text) as PmsRecord
  } catch {
    throw new Error(`${what} returned HTTP ${response.status} without JSON`)
  }
}

/** CloudWORK wraps payloads as `{status, data}`; the login endpoint sometimes returns them bare. */
function unwrap(payload: PmsRecord): PmsRecord {
  const data = payload.data
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as PmsRecord) : payload
}

function messageOf(payload: PmsRecord, fallback: string): string {
  return typeof payload.message === 'string' && payload.message ? payload.message : fallback
}

/**
 * Talks to PMS through both of its APIs, as the CloudGO pms-mcp server does:
 * CloudWORK (`/api/CloudWorkApi.php`, the mobile app API, password login) carries the workflow
 * calls with server-side rules; OpenAPI (access key) covers picklist metadata and timesheets.
 */
export class PmsClient {
  private cloudWorkToken: string | null = null
  private openApiToken: { token: string; expiresAt: number } | null = null
  user: { id: string; name: string } | null = null
  /** PMS `report_to`: my direct managers, who the web report form assigns every report to. */
  managerIds: string[] = []

  constructor(readonly account: PmsAccount) {}

  async login(): Promise<{ id: string; name: string }> {
    const response = await postJson(
      `${this.account.baseUrl}/api/CloudGoAppApi.php`,
      {
        RequestAction: 'Login',
        Credentials: { username: this.account.username, password: this.account.password }
      },
      {}
    )
    const payload = unwrap(await readJson(response, 'PMS login'))
    const token = payload.token
    if (typeof token !== 'string' || !token) {
      throw new Error(`PMS login failed: ${messageOf(payload, 'wrong username or password')}`)
    }
    const info = (payload.user_info ?? {}) as PmsRecord
    const name = [info.first_name, info.last_name].filter(
      (part) => typeof part === 'string' && part
    )
    this.cloudWorkToken = token
    this.user = {
      id: String(info.id ?? ''),
      name: name.length > 0 ? name.join(' ') : this.account.username
    }
    const reportTo = Array.isArray(info.report_to) ? info.report_to : []
    this.managerIds = [
      ...new Set(
        reportTo
          .map((owner) => String(owner).replace(/^Users:/, ''))
          .filter((id) => /^\d+$/.test(id) && id !== this.user?.id)
      )
    ]
    return this.user
  }

  /** Returns the unwrapped `data`; a rejected token logs in again once. */
  async cloudWork(request: PmsCloudWorkRequest, retry = true): Promise<PmsRecord> {
    if (!this.cloudWorkToken) {
      await this.login()
    }
    const response = await postJson(`${this.account.baseUrl}/api/CloudWorkApi.php`, request, {
      Token: this.cloudWorkToken ?? '',
      'X-Api-Version': '2'
    })
    if (response.status === 401 && retry) {
      this.cloudWorkToken = null
      return this.cloudWork(request, false)
    }
    const payload = await readJson(response, `PMS ${request.RequestAction}`)
    if (!response.ok) {
      throw new Error(
        `PMS ${request.RequestAction}: ${messageOf(payload, `HTTP ${response.status}`)}`
      )
    }
    return unwrap(payload)
  }

  private async openApiAccessToken(): Promise<string> {
    if (this.openApiToken && this.openApiToken.expiresAt > Date.now() + 60_000) {
      return this.openApiToken.token
    }
    const query = new URLSearchParams({
      action: 'auth',
      username: this.account.username,
      access_key_md5: createHash('md5').update(this.account.accessKey).digest('hex')
    })
    const response = await fetch(`${this.account.baseUrl}/api/OpenAPI/Endpoint.php?${query}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const payload = await readJson(response, 'PMS OpenAPI auth')
    const tokenPayload = 'access_token' in payload ? payload : unwrap(payload)
    const token = tokenPayload.access_token
    if (typeof token !== 'string' || !token) {
      throw new Error(`PMS OpenAPI login failed: ${messageOf(payload, 'check the access key')}`)
    }
    const expireTime = Number(tokenPayload.expire_time)
    this.openApiToken = {
      token,
      // `expire_time` is epoch seconds; assume the documented 1h when it is absent.
      expiresAt:
        Number.isFinite(expireTime) && expireTime > 0 ? expireTime * 1000 : Date.now() + 3_600_000
    }
    return token
  }

  async openApi(
    action: string,
    params: Record<string, string>,
    body?: PmsRecord
  ): Promise<PmsRecord> {
    const query = new URLSearchParams({ action, ...params })
    const response = await fetch(`${this.account.baseUrl}/api/OpenAPI/Endpoint.php?${query}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Access-Token': await this.openApiAccessToken(),
        ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const payload = await readJson(response, `PMS OpenAPI ${action}`)
    if (!response.ok || String(payload.success ?? '1') === '0') {
      throw new Error(`PMS OpenAPI ${action}: ${messageOf(payload, `HTTP ${response.status}`)}`)
    }
    return payload
  }
}
