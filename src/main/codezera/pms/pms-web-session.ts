import type { PmsAccount } from './pms-account-store'
import type { PmsClient } from './pms-client'
import type { PmsRecord } from './pms-records'

const REQUEST_TIMEOUT_MS = 30_000

function isLoginPage(url: string, body: string): boolean {
  return (
    url.includes('view=Login') ||
    url.includes('error=login') ||
    body.includes('name="username"') ||
    body.includes("name='username'")
  )
}

/**
 * The PMS web UI session (PHPSESSID), for what neither API offers: the Ticket Dashboard queue and
 * `SaveAjax`, the only save that accepts the ticket's user fields (Người xử lý/xác minh/tiếp nhận).
 */
export class PmsWebSession {
  private cookies = new Map<string, string>()
  private csrf: string | null = null
  private opening: Promise<string> | null = null

  constructor(private readonly account: PmsAccount) {}

  private async request(
    path: string,
    init: { form?: Record<string, string>; redirect?: RequestRedirect } = {}
  ): Promise<{ status: number; url: string; location: string; body: string }> {
    const response = await fetch(`${this.account.baseUrl}/${path}`, {
      method: init.form ? 'POST' : 'GET',
      redirect: init.redirect ?? 'follow',
      headers: {
        Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        // Read actions check the referer against the site URL.
        Referer: `${this.account.baseUrl}/index.php`,
        // Pages render their full layout (with the CSRF token) only for non-XHR requests.
        ...(init.form
          ? {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            }
          : {})
      },
      ...(init.form ? { body: new URLSearchParams(init.form).toString() } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';')
      const index = pair.indexOf('=')
      if (index > 0) {
        this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
      }
    }
    return {
      status: response.status,
      url: response.url,
      location: response.headers.get('location') ?? '',
      body: await response.text()
    }
  }

  private async login(): Promise<void> {
    this.cookies.clear()
    this.csrf = null
    const page = await this.request('index.php?module=Users&view=Login')
    const token = /name=["']__vtrftk["']\s+value=["']([^"']+)["']/.exec(page.body)?.[1]
    if (!token) {
      throw new Error('PMS web login page has no CSRF token; the PMS layout may have changed.')
    }
    const result = await this.request('index.php', {
      redirect: 'manual',
      form: {
        __vtrftk: token,
        module: 'Users',
        action: 'Login',
        language: 'vn_vn',
        username: this.account.username,
        password: this.account.password
      }
    })
    if (result.location.includes('view=Login') || result.location.includes('error=login')) {
      throw new Error('PMS web login failed: wrong password, locked account or 2FA.')
    }
  }

  /** CSRF token of a logged-in page; concurrent callers share one login so cookies never race. */
  private ensureSession(): Promise<string> {
    if (this.csrf) {
      return Promise.resolve(this.csrf)
    }
    this.opening ??= this.openSession().finally(() => {
      this.opening = null
    })
    return this.opening
  }

  private async openSession(): Promise<string> {
    for (const fresh of [false, true]) {
      if (fresh || this.cookies.size === 0) {
        await this.login()
      }
      const page = await this.request('index.php?module=HelpDesk&view=List')
      const token = /csrfMagicToken\s*=\s*"([^"]+)"/.exec(page.body)?.[1]
      if (!isLoginPage(page.url, page.body) && token) {
        this.csrf = token
        return token
      }
    }
    throw new Error('PMS web session could not be opened.')
  }

  /** POSTs a web action and returns its `result`; an expired session logs in again once. */
  async action(form: Record<string, string>, retry = true): Promise<PmsRecord> {
    const csrf = await this.ensureSession()
    const response = await this.request('index.php', { form: { ...form, __vtrftk: csrf } })
    let payload: PmsRecord
    try {
      payload = JSON.parse(response.body) as PmsRecord
    } catch {
      // A login page means the session expired; "Invalid request" means a stale CSRF token.
      const stale = isLoginPage(response.url, response.body) || response.body === 'Invalid request'
      if (retry && stale) {
        // Another caller may already have reopened the session; only reset the one we used.
        if (this.csrf === csrf) {
          this.csrf = null
          this.cookies.clear()
        }
        return this.action(form, false)
      }
      throw new Error(
        `PMS ${form.module}.${form.action} returned HTTP ${response.status} without JSON`
      )
    }
    if (!payload.success) {
      const error = (payload.error ?? {}) as PmsRecord
      const message = typeof error.message === 'string' ? error.message : JSON.stringify(payload)
      throw new Error(`PMS ${form.module}.${form.action}: ${message}`)
    }
    return (payload.result ?? {}) as PmsRecord
  }
}

const sessions = new WeakMap<PmsClient, PmsWebSession>()

/** One web session per connected client; a new account gets a new client and so a new session. */
export function pmsWebSession(pms: PmsClient): PmsWebSession {
  let session = sessions.get(pms)
  if (!session) {
    session = new PmsWebSession(pms.account)
    sessions.set(pms, session)
  }
  return session
}
