import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  DEFAULT_GIT_GRAPH_REPO_SETTINGS,
  type GitGraphRepoSettings
} from '../../../shared/codezera/git-graph-types'

const RepoSettingsSchema = z.object({
  initialBranches: z.array(z.string().max(512)).max(500).nullable(),
  showStashes: z.boolean(),
  showTags: z.boolean(),
  includeReflogs: z.boolean(),
  firstParentOnly: z.boolean(),
  hiddenRemotes: z.array(z.string().max(255)).max(100),
  issueLinking: z
    .object({ issueRegex: z.string().min(1).max(500), issueUrl: z.string().min(1).max(2048) })
    .nullable()
})

const FileSchema = z.record(z.string(), z.unknown())

let cache: Record<string, unknown> | null = null
let writeChain: Promise<void> = Promise.resolve()

async function readAll(): Promise<Record<string, unknown>> {
  if (cache) {
    return cache
  }
  try {
    const path = join(app.getPath('userData'), 'codezera', 'git-graph-repos.json')
    cache = FileSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    cache = {}
  }
  return cache
}

/** Unknown or older shapes fall back field by field to defaults instead of failing the graph. */
export async function getGitGraphRepoSettings(repoId: string): Promise<GitGraphRepoSettings> {
  const stored = (await readAll())[repoId]
  const merged = {
    ...DEFAULT_GIT_GRAPH_REPO_SETTINGS,
    ...(typeof stored === 'object' && stored !== null ? stored : {})
  }
  const parsed = RepoSettingsSchema.safeParse(merged)
  return parsed.success ? parsed.data : DEFAULT_GIT_GRAPH_REPO_SETTINGS
}

export async function setGitGraphRepoSettings(repoId: string, settings: unknown): Promise<void> {
  if (!repoId || repoId.length > 512) {
    throw new Error('Invalid repository id')
  }
  const valid = RepoSettingsSchema.parse(settings)
  if (valid.issueLinking) {
    // Reject regexes the renderer could not compile before they reach disk.
    new RegExp(valid.issueLinking.issueRegex, 'g')
  }
  const all = { ...(await readAll()), [repoId]: valid }
  cache = all
  writeChain = writeChain.then(async () => {
    const path = join(app.getPath('userData'), 'codezera', 'git-graph-repos.json')
    await mkdir(dirname(path), { recursive: true })
    const temp = `${path}.tmp`
    await writeFile(temp, JSON.stringify(all, null, 2), 'utf8')
    await rename(temp, path)
  })
  await writeChain
}
