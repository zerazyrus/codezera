import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'

const ProfilesFileSchema = z.record(z.string(), z.string())

/** Remembers the sftp.json profile picked per workspace path, in one JSON file. */
export class SftpProfileStore {
  private cache: Record<string, string> | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async get(workspacePath: string): Promise<string | null> {
    return (await this.readAll())[workspacePath] ?? null
  }

  async set(workspacePath: string, profile: string): Promise<void> {
    const all = { ...(await this.readAll()), [workspacePath]: profile }
    this.cache = all
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true })
        const temp = `${this.filePath}.tmp`
        await writeFile(temp, JSON.stringify(all, null, 2), 'utf8')
        await rename(temp, this.filePath)
      })
    await this.writeChain
  }

  private async readAll(): Promise<Record<string, string>> {
    if (!this.cache) {
      try {
        this.cache = ProfilesFileSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8')))
      } catch {
        this.cache = {}
      }
    }
    return this.cache
  }
}
