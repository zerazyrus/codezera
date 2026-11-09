import type { ChildProcess } from 'node:child_process'
import type { Client, SFTPWrapper } from 'ssh2'
import { loadSsh2 } from '../../ssh/authentication/ssh2-module-load'
import { openSftpConnectConfig, type SftpEndpoint } from './sftp-endpoint'

const IDLE_CLOSE_MS = 10 * 60_000

/** The SFTP channel plus its SSH client, which root writes need for `exec`. */
export type SftpConnection = { client: Client; sftp: SFTPWrapper }

type PooledConnection = {
  ready: Promise<SftpConnection>
  client: Client
  proxyProcess: ChildProcess | null
  idleTimer: NodeJS.Timeout | undefined
  closed: boolean
}

/** One live SFTP session per key (workspace + profile + host), closed after ten idle minutes. */
export class SftpConnectionPool {
  private readonly connections = new Map<string, PooledConnection>()

  async acquire(key: string, endpoint: SftpEndpoint): Promise<SftpConnection> {
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
    const { promise, resolve, reject } = Promise.withResolvers<SftpConnection>()
    // Callers that never await (pool eviction) must not surface an unhandled rejection.
    promise.catch(() => {})
    const entry: PooledConnection = {
      client,
      proxyProcess: null,
      idleTimer: undefined,
      closed: false,
      ready: promise
    }
    const fail = (error: Error): void => {
      this.close(key, entry)
      reject(new Error(`${endpoint.label}: ${error.message}`))
    }
    client.once('ready', () => {
      client.sftp((error, sftp) => (error ? fail(error) : resolve({ client, sftp })))
    })
    client.on('error', fail)
    client.once('close', () => fail(new Error(`Connection to ${endpoint.label} closed`)))
    try {
      const { config, proxyProcess } = openSftpConnectConfig(endpoint)
      entry.proxyProcess = proxyProcess
      client.connect(config)
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
    }
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
      entry.proxyProcess?.kill()
    }
  }
}
