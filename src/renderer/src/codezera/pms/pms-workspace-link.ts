import type { PmsItem, PmsItemDetail } from '../../../../shared/codezera/pms-types'
import { loadPmsWorkflow } from './pms-workflow'

const MAX_SLUG_LENGTH = 40

/** ASCII branch slug of a Vietnamese title; leading `[Project]` tags are dropped because the branch already says which ticket. */
function slugify(title: string): string {
  const slug = title
    .replace(/^(\s*\[[^\]]*\])+/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= MAX_SLUG_LENGTH) {
    return slug
  }
  // Cut at the last word boundary within the limit; the boundary may sit right after it.
  const boundary = slug.lastIndexOf('-', MAX_SLUG_LENGTH)
  return slug.slice(0, boundary > 0 ? boundary : MAX_SLUG_LENGTH)
}

/** Tickets by their `#number` (what people say aloud), tasks by record id because PMS lists tasks without their number. */
export function pmsWorkspaceName(item: PmsItem): string {
  const key = item.kind === 'ticket' ? `ticket-${item.number.replace(/^#/, '')}` : `task-${item.id}`
  const slug = slugify(item.title)
  return slug ? `${key}-${slug}` : key
}

const FEATURE_CATEGORIES = ['Improve', 'Change Request', 'portal_mini_app']

/** Git-flow branch the team uses: `bug/#27463-slug`, `feature/#…` for improvements, `task/…` otherwise. */
export function pmsBranchName(item: PmsItem, category: string): string {
  const prefix =
    item.kind === 'task'
      ? 'task'
      : category === 'Bug'
        ? 'bug'
        : FEATURE_CATEGORIES.includes(category)
          ? 'feature'
          : 'task'
  const key = item.kind === 'ticket' ? item.number || `#${item.id}` : item.number || item.id
  const slug = slugify(item.title)
  return `${prefix}/${key}${slug ? `-${slug}` : ''}`
}

const SECTION_TITLES: Record<PmsItemDetail['sections'][number]['key'], string> = {
  description: 'Description',
  steps: 'Steps to reproduce',
  expected: 'Expected result',
  actual: 'Actual result',
  solution: 'Solution'
}

/** Prompt an agent can start from: the PMS record verbatim, then the team's workflow from Settings. */
export function pmsAgentPrompt(item: PmsItemDetail): string {
  const label = item.kind === 'ticket' ? 'PMS ticket' : 'PMS task'
  const lines = [
    `Work on ${label} ${item.number || item.id}: ${item.title}`,
    `URL: ${item.url}`,
    `Status: ${item.status}${item.projectLabel ? ` · Project: ${item.projectLabel}` : ''}`
  ]
  for (const section of item.sections) {
    lines.push('', `## ${SECTION_TITLES[section.key]}`, section.text)
  }
  const images = item.ticket?.images ?? []
  if (images.length > 0) {
    lines.push(
      '',
      '## Attached images',
      `View every image before analysing: \`orca pms images ${item.id}\` saves them locally and prints the paths (or download these public URLs into a temp folder outside the repo):`,
      ...images.map((image) => `- ${image.name}: ${image.url}`)
    )
  }
  lines.push(
    '',
    '## PMS commands',
    `Read comments with \`orca pms comment list ${item.id}\`. Run \`orca skills get orca-pms\` for every PMS command (status, cause/solution, log time, reports) and when writes are allowed.`
  )
  lines.push('', '## Workflow', loadPmsWorkflow())
  return lines.join('\n')
}
