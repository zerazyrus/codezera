import { readFile } from 'node:fs/promises'
import type { Client, ConnectConfig, SFTPWrapper } from 'ssh2'
import { loadSsh2 } from '../../ssh/ssh2-module-load'
import type { SftpEndpoint } from './sftp-endpoint'

const IDLE_CLOSE_MS = 10 * 60_000

type PooledConnection = {
  ready: Promise<SFTPWrapper>
  client: Client
  idleTimer: NodeJS.Timeout | undefined
  closed: boolean
}

async function buildConnectConfig(endpoint: SftpEndpoint): Promise<ConnectConfig> {
  const config: ConnectConfig = {
    host: endpoint.host,
    port: endpoint.port,
    username: endpoint.username,
    readyTimeout: endpoint.connectTimeout,
    keepaliveInterval: 15_000,
    tryKeyboard: false
  }
  for (const path of endpoint.privateKeyPaths) {
    try {
      config.privateKey = await readFile(path)
      break
    } catch {
      // A missing key falls through to the next candidate, then the agent.
    }
  }
  if (endpoint.privateKeyPaths.length > 0 && !config.privateKey) {
    throw new Error(`Cannot read private key ${endpoint.privateKeyPaths[0]}`)
  }
  if (endpoint.passphrase) {
    config.passphrase = endpoint.passphrase
  }
  if (endpoint.password) {
    config.password = endpoint.password
  }
  if (process.env.SSH_AUTH_SOCK) {
    config.agent = process.env.SSH_AUTH_SOCK
  }
  return config
}

/** One live SFTP session per key (workspace + profile), closed after ten idle minutes. */
export class SftpConnectionPool {
  private readonly connections = new Map<string, PooledConnection>()

  async acquire(key: string, endpoint: SftpEndpoint): Promise<SFTPWrapper> {
    let entry = this.connections.get(key)
    if (!entry) {
      entry = this.open(key, endpoint)
      this.connections.set(key, entry)
    }
    clearTimeout(entry.idleTimer)
    const current = entry
    current.idleTimer = setTimeout(() => this.close(key, current), IDLE_CLOSE_MS)
    current.idleTimer.unref?.()
    return current.ready
  }

  /** Closes every connection whose key starts with `prefix`. */
  closeMatching(prefix: string): void {
    for (const [key, entry] of this.connections) {
      if (key.startsWith(prefix)) {
        this.close(key, entry)
      }
    }
  }

  closeAll(): void {
    this.closeMatching('')
  }

  private open(key: string, endpoint: SftpEndpoint): PooledConnection {
    const { Client: SshClient } = loadSsh2()
    const client = new SshClient()
    const { promise, resolve, reject } = Promise.withResolvers<SFTPWrapper>()
    // Callers that never await (pool eviction) must not surface an unhandled rejection.
    promise.catch(() => {})
    const entry: PooledConnection = { client, idleTimer: undefined, closed: false, ready: promise }
    const fail = (error: Error): void => {
      this.close(key, entry)
      reject(new Error(`${endpoint.username}@${endpoint.host}:${endpoint.port}: ${error.message}`))
    }
    client.once('ready', () => {
      client.sftp((error, sftp) => (error ? fail(error) : resolve(sftp)))
    })
    client.on('error', fail)
    client.once('close', () => fail(new Error(`Connection to ${endpoint.host} closed`)))
    buildConnectConfig(endpoint).then((config) => client.connect(config), fail)
    return entry
  }

  private close(key: string, entry: PooledConnection): void {
    if (this.connections.get(key) === entry) {
      this.connections.delete(key)
    }
    clearTimeout(entry.idleTimer)
    if (!entry.closed) {
      entry.closed = true
      entry.client.end()
    }
  }
}
