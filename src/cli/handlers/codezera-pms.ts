import type { PmsItemDetail, PmsItemKind, PmsListResult } from '../../shared/codezera/pms-types'
import type { PmsQueue } from '../../shared/codezera/pms-dashboard-types'
import { readTextOrFileFlag } from '../command-body-input'
import type { CommandHandler, HandlerContext } from '../dispatch'
import {
  getOptionalJsonFlag,
  getOptionalNonNegativeIntegerFlag,
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRepeatedStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

type PmsComment = {
  id: string
  author: string
  createdTime: string
  text: string
  files: { name: string; url: string }[]
  replies: PmsComment[]
}

function call<T>(context: HandlerContext, action: string, args?: unknown) {
  return context.client.call<T>('codezera.pms', { action, args })
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function idFlag(context: HandlerContext): string {
  const id = getRequiredStringFlag(context.flags, 'id').replace(/^#/, '')
  if (!/^\d+$/.test(id)) {
    throw new RuntimeClientError('invalid_argument', `PMS ids are numeric, got "${id}"`)
  }
  return id
}

function kindFlag(context: HandlerContext, fallback: PmsItemKind): PmsItemKind {
  const kind = getOptionalStringFlag(context.flags, 'kind') ?? fallback
  if (kind !== 'ticket' && kind !== 'task') {
    throw new RuntimeClientError('invalid_argument', '--kind must be ticket or task')
  }
  return kind
}

function boolFlag(context: HandlerContext, name: string): boolean {
  const value = context.flags.get(name)
  return value === true || value === 'true'
}

function fieldsFlag(context: HandlerContext): Record<string, string> {
  const raw = getOptionalJsonFlag(context.flags, 'fields-json')
  if (raw === undefined) {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RuntimeClientError('invalid_argument', '--fields-json is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RuntimeClientError('invalid_argument', '--fields-json must be a JSON object')
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]))
}

function today(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function requiredText(context: HandlerContext, flag: string): Promise<string> {
  return (await readTextOrFileFlag(context.flags, context.cwd, flag, true)) ?? ''
}

function formatDetail(item: PmsItemDetail): string {
  const lines = [
    `${item.kind === 'ticket' ? 'Ticket' : 'Task'} ${item.number || item.id}: ${item.title}`,
    `URL: ${item.url}`,
    `Status: ${item.status} · Priority: ${item.priority || '-'} · Category: ${item.category || '-'}`,
    `Project: ${item.projectLabel ?? '-'} · Logged: ${item.hours}h · Created: ${item.createdTime}`
  ]
  for (const section of item.sections) {
    lines.push('', `## ${section.key}`, section.text)
  }
  const images = item.ticket?.images ?? []
  if (images.length > 0) {
    lines.push('', `## images (orca pms images ${item.id} downloads them)`)
    lines.push(...images.map((image) => `- ${image.name}: ${image.url}`))
  }
  if (item.nextStatuses.length > 0) {
    lines.push('', `Next statuses: ${item.nextStatuses.map((option) => option.value).join(', ')}`)
  }
  return lines.join('\n')
}

function formatList(result: PmsListResult): string {
  const rows = result.items.map(
    (item) => `${item.id}\t${item.number}\t${item.status}\t${item.title}`
  )
  const more = result.nextOffset === null ? '' : `\n… more with --offset ${result.nextOffset}`
  return `${rows.join('\n') || 'No items.'}\nTotal: ${result.total}${more}`
}

function formatQueue(queue: PmsQueue): string {
  const lines = queue.buckets.flatMap((bucket) =>
    bucket.rows.map(
      (row) =>
        `${row.id}\t${row.number}\t${row.status}\t${row.due || '-'}${row.late ? ' late' : ''}\t${row.title}`
    )
  )
  return `${lines.join('\n') || 'No open tickets.'}\nTotal: ${queue.total} · Page ${queue.page}/${queue.pageCount}`
}

function formatComments(comments: PmsComment[], depth = 0): string {
  const indent = '  '.repeat(depth)
  return comments
    .map((comment) => {
      const files = comment.files.map((file) => `\n${indent}  [file] ${file.name}: ${file.url}`)
      const head = `${indent}#${comment.id} ${comment.author} · ${comment.createdTime}`
      const body = comment.text.replace(/^/gm, `${indent}  `)
      const replies =
        comment.replies.length > 0 ? `\n${formatComments(comment.replies, depth + 1)}` : ''
      return `${head}\n${body}${files.join('')}${replies}`
    })
    .join('\n\n')
}

export const CODEZERA_PMS_HANDLERS: Record<string, CommandHandler> = {
  'pms whoami': async (context) => {
    printResult(await call(context, 'getStatus'), context.json, prettyJson)
  },
  'pms show': async (context) => {
    const response = await call<PmsItemDetail>(context, 'getItem', {
      kind: kindFlag(context, 'ticket'),
      id: idFlag(context)
    })
    printResult(response, context.json, formatDetail)
  },
  'pms list': async (context) => {
    const owner = getOptionalStringFlag(context.flags, 'owner')
    const response = await call<PmsListResult>(context, 'list', {
      kind: kindFlag(context, 'ticket'),
      status: getOptionalStringFlag(context.flags, 'status') ?? null,
      search: getOptionalStringFlag(context.flags, 'search') ?? '',
      offset: getOptionalNonNegativeIntegerFlag(context.flags, 'offset') ?? 0,
      ...(owner ? { ownerId: owner } : {})
    })
    printResult(response, context.json, formatList)
  },
  'pms queue': async (context) => {
    const user = getOptionalStringFlag(context.flags, 'user')
    const response = await call<PmsQueue>(context, 'queue', {
      filters: {
        role: getOptionalStringFlag(context.flags, 'role') ?? 'all',
        ...(user ? { user } : {}),
        company: '',
        projectType: '',
        project: ''
      },
      layout: 'list',
      keyword: getOptionalStringFlag(context.flags, 'search') ?? '',
      status: getOptionalStringFlag(context.flags, 'status') ?? '',
      page: getOptionalPositiveIntegerFlag(context.flags, 'page') ?? 1,
      quadrantPages: {}
    })
    printResult(response, context.json, formatQueue)
  },
  'pms comment list': async (context) => {
    const response = await call<PmsComment[]>(context, 'comments', idFlag(context))
    printResult(response, context.json, (comments) => formatComments(comments) || 'No comments.')
  },
  'pms comment add': async (context) => {
    const parentId = getOptionalStringFlag(context.flags, 'reply-to')
    const response = await call<PmsComment[]>(context, 'addComment', {
      id: idFlag(context),
      text: await requiredText(context, 'body'),
      ...(parentId ? { parentId } : {})
    })
    printResult(response, context.json, formatComments)
  },
  'pms images': async (context) => {
    const response = await call<{ name: string; path: string }[]>(
      context,
      'downloadImages',
      idFlag(context)
    )
    printResult(
      response,
      context.json,
      (images) => images.map((image) => `${image.path}\t${image.name}`).join('\n') || 'No images.'
    )
  },
  'pms users': async (context) => {
    const response = await call<{ id: string; name: string }[]>(context, 'users')
    printResult(response, context.json, (users) =>
      users.map((user) => `${user.id}\t${user.name}`).join('\n')
    )
  },
  'pms status options': async (context) => {
    printResult(
      await call(context, 'statusOptions', kindFlag(context, 'ticket')),
      context.json,
      prettyJson
    )
  },
  'pms task status': async (context) => {
    const response = await call<PmsItemDetail>(context, 'setStatus', {
      kind: 'task',
      id: idFlag(context),
      status: getRequiredStringFlag(context.flags, 'to')
    })
    printResult(response, context.json, formatDetail)
  },
  'pms ticket options': async (context) => {
    printResult(
      await call(context, 'ticketFieldOptions', getRequiredStringFlag(context.flags, 'field')),
      context.json,
      prettyJson
    )
  },
  'pms ticket tasks': async (context) => {
    printResult(await call(context, 'ticketTasks', idFlag(context)), context.json, prettyJson)
  },
  'pms ticket take': async (context) => {
    const response = await call(context, 'takeTicket', {
      ticketId: idFlag(context),
      fields: fieldsFlag(context),
      taskType: getOptionalStringFlag(context.flags, 'task-type') ?? null,
      createTask: !boolFlag(context, 'no-task')
    })
    printResult(response, context.json, prettyJson)
  },
  'pms ticket update': async (context) => {
    const response = await call(context, 'saveTicket', {
      ticketId: idFlag(context),
      status: getOptionalStringFlag(context.flags, 'status') ?? null,
      fields: fieldsFlag(context)
    })
    printResult(response, context.json, prettyJson)
  },
  'pms ticket finish': async (context) => {
    const response = await call(context, 'finishTicket', {
      ticketId: idFlag(context),
      status: getRequiredStringFlag(context.flags, 'status'),
      cause: await requiredText(context, 'cause'),
      solution: await requiredText(context, 'solution'),
      gitCommit: getOptionalStringFlag(context.flags, 'commit') ?? '',
      fields: fieldsFlag(context)
    })
    printResult(response, context.json, prettyJson)
  },
  'pms ticket add-task': async (context) => {
    const response = await call(context, 'createTicketTask', {
      ticketId: idFlag(context),
      title: getOptionalStringFlag(context.flags, 'title') ?? '',
      taskType: getOptionalStringFlag(context.flags, 'task-type') ?? null
    })
    printResult(response, context.json, prettyJson)
  },
  'pms logtime add': async (context) => {
    const response = await call(context, 'logTime', {
      kind: kindFlag(context, 'task'),
      id: idFlag(context),
      hours: getOptionalNonNegativeIntegerFlag(context.flags, 'hours') ?? 0,
      minutes: getOptionalNonNegativeIntegerFlag(context.flags, 'minutes') ?? 0,
      category: getRequiredStringFlag(context.flags, 'category'),
      date: getOptionalStringFlag(context.flags, 'date') ?? today(),
      description: await requiredText(context, 'body')
    })
    printResult(response, context.json, () => 'Logged.')
  },
  'pms logtime categories': async (context) => {
    printResult(await call(context, 'logTimeCategories'), context.json, prettyJson)
  },
  'pms logtime hours': async (context) => {
    const date = getOptionalStringFlag(context.flags, 'date') ?? today()
    const response = await call<number>(context, 'loggedHours', date)
    printResult(response, context.json, (hours) => `${date}: ${hours}h`)
  },
  'pms report preview': async (context) => {
    const response = await call(context, 'reportPreview', {
      type: getRequiredStringFlag(context.flags, 'type'),
      date: getOptionalStringFlag(context.flags, 'date') ?? today()
    })
    printResult(response, context.json, prettyJson)
  },
  'pms report submit': async (context) => {
    const response = await call(context, 'submitReport', {
      type: getRequiredStringFlag(context.flags, 'type'),
      date: getOptionalStringFlag(context.flags, 'date') ?? today(),
      name: getRequiredStringFlag(context.flags, 'name'),
      description: await requiredText(context, 'body'),
      recipientIds: getRepeatedStringFlag(context.flags, 'to'),
      draft: boolFlag(context, 'draft')
    })
    printResult(response, context.json, prettyJson)
  }
}
