import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type {
  SftpConnectionsFile,
  SftpWorkspaceConnections
} from '../../../shared/codezera/sftp-types'

const ProfileSchema = z.object({
  name: z.string().min(1),
  sshTargetId: z.string().min(1),
  remotePath: z.string().min(1),
  uploadOnSave: z.boolean(),
  ignore: z.array(z.string()),
  terminalCommand: z.string().optional(),
  sudo: z.boolean().optional()
})

const ConnectionsFileSchema = z.record(
  z.string(),
  z.object({ activeProfile: z.string(), profiles: z.array(ProfileSchema).min(1) })
)

/** Codezera's own SFTP config: one JSON file in userData, keyed by local workspace root. */
export class SftpConnectionStore {
  private cache: SftpConnectionsFile | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async get(workspacePath: string): Promise<SftpWorkspaceConnections | null> {
    return (await this.readAll())[workspacePath] ?? null
  }

  async list(): Promise<SftpConnectionsFile> {
    return { ...(await this.readAll()) }
  }

  /** Replaces a workspace's config; null removes it. */
  async set(workspacePath: string, connections: SftpWorkspaceConnections | null): Promise<void> {
    const { [workspacePath]: _previous, ...others } = await this.readAll()
    const all = connections ? { ...others, [workspacePath]: connections } : others
    this.cache = all
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true })
        const temp = `${this.filePath}.tmp`
        await writeFile(temp, `${JSON.stringify(all, null, 2)}\n`, 'utf8')
        await rename(temp, this.filePath)
      })
    await this.writeChain
  }

  private async readAll(): Promise<SftpConnectionsFile> {
    if (!this.cache) {
      let text: string
      try {
        text = await readFile(this.filePath, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        text = '{}'
      }
      // A damaged file must surface, not be silently replaced by the next write.
      const parsed = ConnectionsFileSchema.safeParse(JSON.parse(text))
      if (!parsed.success) {
        throw new Error(`${this.filePath} is invalid: ${parsed.error.issues[0]?.message}`)
      }
      this.cache = parsed.data
    }
    return this.cache
  }
}
