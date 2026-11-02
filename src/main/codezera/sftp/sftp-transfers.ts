import { mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import type { FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2'
import type { SftpRemoteEntry, SftpTransferResult } from '../../../shared/codezera/sftp-types'

const TRANSFER_CONCURRENCY = 4
/** Diffing larger files in Monaco is not useful and would bloat IPC. */
export const MAX_REMOTE_READ_BYTES = 10 * 1024 * 1024
const SFTP_NO_SUCH_FILE = 2

/** Decides by path relative to the SFTP root; true leaves the entry (and a folder's contents) out. */
export type SftpIgnoreCheck = (relativePath: string, isDirectory: boolean) => boolean

export type TransferCounts = Omit<SftpTransferResult, 'localPath' | 'remotePath'>

export function call<T>(
  register: (callback: (error: Error | null | undefined, value: T) => void) => void
): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>()
  register((error, value) => (error ? reject(error) : resolve(value)))
  return promise
}

export async function statRemote(sftp: SFTPWrapper, remotePath: string): Promise<Stats | null> {
  try {
    return await call<Stats>((callback) => sftp.stat(remotePath, callback))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === SFTP_NO_SUCH_FILE) {
      return null
    }
    throw error
  }
}

const REMOTE_NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Folder entries, folders first then by name; symlinks report what they point at. */
export async function listRemoteDirectory(
  sftp: SFTPWrapper,
  remoteDir: string,
  isIgnored: (name: string, isDirectory: boolean) => boolean
): Promise<SftpRemoteEntry[]> {
  const list = await call<FileEntryWithStats[]>((callback) => sftp.readdir(remoteDir, callback))
  const entries = await Promise.all(
    list
      .filter((item) => item.filename !== '.' && item.filename !== '..')
      .map(async (item): Promise<SftpRemoteEntry> => {
        const path = posix.join(remoteDir, item.filename)
        let attrs: Stats = item.attrs
        if (attrs.isSymbolicLink()) {
          // A dangling link stays listed as a file so the user still sees it.
          attrs = (await statRemote(sftp, path).catch(() => null)) ?? attrs
        }
        return {
          name: item.filename,
          path,
          isDirectory: attrs.isDirectory(),
          size: attrs.size,
          mtimeMs: attrs.mtime * 1000
        }
      })
  )
  return entries
    .filter((entry) => !isIgnored(entry.name, entry.isDirectory))
    .sort((a, b) =>
      a.isDirectory === b.isDirectory
        ? REMOTE_NAME_COLLATOR.compare(a.name, b.name)
        : a.isDirectory
          ? -1
          : 1
    )
}

export async function readRemoteFileText(
  sftp: SFTPWrapper,
  remotePath: string
): Promise<string | null> {
  const stats = await statRemote(sftp, remotePath)
  if (!stats) {
    return null
  }
  if (stats.isDirectory()) {
    throw new Error(`${remotePath} is a folder on the server`)
  }
  if (stats.size > MAX_REMOTE_READ_BYTES) {
    throw new Error(`${remotePath} is larger than 10 MB`)
  }
  const buffer = await call<Buffer>((callback) => sftp.readFile(remotePath, callback))
  return buffer.toString('utf8')
}

async function mkdirRemote(
  sftp: SFTPWrapper,
  remoteDir: string,
  known: Set<string>
): Promise<void> {
  if (known.has(remoteDir) || remoteDir === '/' || remoteDir === '.') {
    return
  }
  const existing = await statRemote(sftp, remoteDir)
  if (existing) {
    if (!existing.isDirectory()) {
      throw new Error(`${remoteDir} exists on the server and is not a folder`)
    }
  } else {
    await mkdirRemote(sftp, posix.dirname(remoteDir), known)
    await call<void>((callback) => sftp.mkdir(remoteDir, callback)).catch(async (error) => {
      // Another parallel upload may have created it first.
      if (!(await statRemote(sftp, remoteDir))?.isDirectory()) {
        throw error
      }
    })
  }
  known.add(remoteDir)
}

export async function runPool<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.min(TRANSFER_CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]!)
    }
  })
  await Promise.all(lanes)
}

type FilePair = { local: string; remote: string; size: number }

/** What an upload will write: remote folders (parents first) and files, after ignore matching. */
export type UploadPlan = { files: FilePair[]; directories: string[]; ignored: number }

/**
 * Walks a local file or folder that maps to `remotePath`.
 * `relativePath` is the local path relative to the SFTP root, used for ignore matching.
 */
export async function planUpload(
  localPath: string,
  remotePath: string,
  relativePath: string,
  isIgnored: SftpIgnoreCheck
): Promise<UploadPlan> {
  const plan: UploadPlan = { files: [], directories: [], ignored: 0 }
  const collect = async (local: string, remote: string, rel: string): Promise<void> => {
    const stats = await stat(local)
    if (isIgnored(rel, stats.isDirectory())) {
      plan.ignored++
      return
    }
    if (stats.isFile()) {
      plan.files.push({ local, remote, size: stats.size })
      return
    }
    if (!stats.isDirectory()) {
      return
    }
    plan.directories.push(remote)
    for (const entry of await readdir(local)) {
      await collect(join(local, entry), posix.join(remote, entry), posix.join(rel, entry))
    }
  }
  await collect(localPath, remotePath, relativePath)
  return plan
}

/** Uploads a plan as the login user, creating missing remote folders. */
export async function uploadPath(sftp: SFTPWrapper, plan: UploadPlan): Promise<TransferCounts> {
  const counts: TransferCounts = { files: 0, directories: 0, ignored: plan.ignored, bytes: 0 }
  const knownDirectories = new Set<string>()
  for (const directory of plan.directories) {
    await mkdirRemote(sftp, directory, knownDirectories)
  }
  counts.directories = plan.directories.length
  await runPool(plan.files, async (file) => {
    await mkdirRemote(sftp, posix.dirname(file.remote), knownDirectories)
    await call<void>((callback) => sftp.fastPut(file.local, file.remote, callback))
    counts.files++
    counts.bytes += file.size
  })
  return counts
}

/** Downloads a remote file or folder to `localPath`, overwriting local files like natizyskunk.sftp. */
export async function downloadPath(
  sftp: SFTPWrapper,
  remotePath: string,
  localPath: string,
  relativePath: string,
  isIgnored: SftpIgnoreCheck
): Promise<TransferCounts> {
  const counts: TransferCounts = { files: 0, directories: 0, ignored: 0, bytes: 0 }
  const root = await statRemote(sftp, remotePath)
  if (!root) {
    throw new Error(`${remotePath} does not exist on the server`)
  }
  const files: FilePair[] = []
  const directories: string[] = []

  const collect = async (
    remote: string,
    local: string,
    rel: string,
    stats: Stats
  ): Promise<void> => {
    if (isIgnored(rel, stats.isDirectory())) {
      counts.ignored++
      return
    }
    if (stats.isFile()) {
      files.push({ local, remote, size: stats.size })
      return
    }
    if (!stats.isDirectory()) {
      return
    }
    directories.push(local)
    const list = await call<FileEntryWithStats[]>((callback) => sftp.readdir(remote, callback))
    for (const item of list) {
      if (item.filename === '.' || item.filename === '..') {
        continue
      }
      const childRemote = posix.join(remote, item.filename)
      const childStats = item.attrs.isSymbolicLink()
        ? await statRemote(sftp, childRemote)
        : item.attrs
      if (childStats) {
        await collect(
          childRemote,
          join(local, item.filename),
          posix.join(rel, item.filename),
          childStats
        )
      }
    }
  }
  await collect(remotePath, localPath, relativePath, root)

  for (const directory of directories) {
    await mkdir(directory, { recursive: true })
  }
  counts.directories = directories.length
  await runPool(files, async (file) => {
    await mkdir(dirname(file.local), { recursive: true })
    await call<void>((callback) => sftp.fastGet(file.remote, file.local, callback))
    counts.files++
    counts.bytes += file.size
  })
  return counts
}
