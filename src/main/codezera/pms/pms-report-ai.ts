import { app } from 'electron'
import { z } from 'zod'
import type { PmsReportPreview, PmsReportWriteResult } from '../../../shared/codezera/pms-types'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from '../../../shared/source-control/ai/generation/commit-message-host-key'
import { cleanGeneratedCommitMessage } from '../../../shared/source-control/ai/generation/commit-message-agent-output'
import { textGenerationFailureCodeFields } from '../../../shared/text-generation-failure-copy'
import type { Store } from '../../persistence/loading-store/store'
import { runGenerationRequest } from '../../text-generation/agent-generation-request'
import {
  prepareLocalCommitMessageAgentEnv,
  type CommitMessageAgentEnvironmentResolvers
} from '../../text-generation/commit-message-agent-environment'
import { resolveTextGenerationParams } from '../../text-generation/commit-message-text-generation'
import { spawnSourceControlAgent } from '../../text-generation/source-control-agent-launch'
import { cancelLocalGeneration } from '../../text-generation/source-control-generation-lanes'
import { groupByProject, pmsReportPreview } from './pms-reports'

// Orca's jira-issue-summary lane keeps multi-line output; our own cwd keeps it off Jira's lane.
const OPERATION = 'jira-issue-summary'
const ArgsSchema = z.object({ type: z.enum(['day', 'week']), date: z.string(), notes: z.string() })

/** The team's report rules, as the `/pms` skill applies them. */
function reportPrompt(preview: PmsReportPreview, notes: string): string {
  const tasks = groupByProject(preview.entries)
    .map(({ project, tasks: list }) =>
      list
        .map(({ entry, title }) => {
          const done = entry.notes.length > 0 ? ` | đã làm: ${entry.notes.join(' / ')}` : ''
          return `[${project || 'Khác'}] ${title} | ${entry.status} | ${entry.hours}h${done}`
        })
        .join('\n')
    )
    .join('\n\n')
  const weekly =
    preview.type === 'week'
      ? `Output has two sections, each heading on its own line: "Đã thực hiện" then a blank line-separated "Dự kiến tuần sau". Under "Dự kiến tuần sau" list follow-ups inferred from tasks not yet Completed; if unsure, leave a single "- ".`
      : 'Output only the task lines, no heading.'
  return `Write the description of a CloudGO PMS ${preview.type === 'day' ? 'daily' : 'weekly'} work report in Vietnamese.

Rules:
- One task per line: "- [Project] short task description". Never join several tasks on one line with "&".
- Keep tasks of the same project together, in input order; exactly one blank line between projects.
- Project label short and capitalized, technical suffixes dropped: "kova_UAT" or "Sơn KOVA - CloudPLUS" -> "Kova", "Yersin MediCRM 2025" -> "Yersin", "PHS 2024" -> "PHS", "Dược Hoàng Đức 2025" -> "Dược Hoàng Đức". A "(Customer)" prefix in a title is the project.
- Shorten each task in end-user language: drop filler ("Kiểm tra và xử lý" -> "Xử lý", "Lỗi khi import" -> "Lỗi import"), drop prefixes like "Lead_", no file/class/SQL names. Keep a ticket number only at the end as "(#21796)".
- ${weekly}
- Output only the description text, no preamble, no code fence.
${notes.trim() ? `\nExtra instructions from the user:\n${notes.trim()}\n` : ''}
Tasks (project | title | status | hours | what was done):
${tasks}`
}

/** Rewrites the report description with the user's Source Control AI agent (Settings → Source Control AI). */
export async function writePmsReport(
  store: Pick<Store, 'getSettings'>,
  agentEnv: CommitMessageAgentEnvironmentResolvers | undefined,
  input: unknown
): Promise<PmsReportWriteResult> {
  const args = ArgsSchema.parse(input)
  const preview = await pmsReportPreview({ type: args.type, date: args.date })
  if (preview.entries.length === 0) {
    return { success: false, error: 'No time logged in this period.' }
  }
  const resolved = resolveTextGenerationParams(
    store.getSettings(),
    LOCAL_COMMIT_MESSAGE_HOST_KEY,
    'pullRequest',
    null
  )
  if (!resolved.ok) {
    return { success: false, error: resolved.error, ...textGenerationFailureCodeFields(resolved) }
  }
  const env = await prepareLocalCommitMessageAgentEnv(resolved.params.agentId, agentEnv)
  if (!env.ok) {
    return { success: false, error: env.error }
  }
  const result = await runGenerationRequest({
    params: resolved.params,
    prompt: reportPrompt(preview, args.notes),
    target: { kind: 'local', cwd: app.getPath('userData'), ...(env.env ? { env: env.env } : {}) },
    spawnAgent: spawnSourceControlAgent,
    operation: OPERATION
  })
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      canceled: result.canceled,
      ...textGenerationFailureCodeFields(result)
    }
  }
  // The shared cleaner trims a leading "- " off the first line; every "[Project] …" line is a bullet.
  const description = cleanGeneratedCommitMessage(result.rawOutput).replace(/^\[/gm, '- [')
  return description
    ? { success: true, description, agentLabel: result.agentLabel }
    : { success: false, error: 'The agent returned an empty report.' }
}

export function cancelWritePmsReport(): void {
  cancelLocalGeneration(OPERATION, app.getPath('userData'))
}
