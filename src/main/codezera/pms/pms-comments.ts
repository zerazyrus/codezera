import { z } from 'zod'
import { connectedClient, IdSchema } from './pms-service'
import { pmsField, pmsHtmlToText, type PmsRecord } from './pms-records'

export type PmsComment = {
  id: string
  author: string
  createdTime: string
  text: string
  files: { name: string; url: string }[]
  replies: PmsComment[]
}

const AddArgsSchema = z.object({
  id: IdSchema,
  text: z.string().trim().min(1).max(20_000),
  /** Reply to this comment instead of commenting on the record. */
  parentId: IdSchema.optional()
})

/** `[{id:"Users:4221", name:"Lê Minh Nguyệt (nguyet.le@…)"}]` → the name without the email. */
function authorOf(comment: PmsRecord): string {
  const owners = Array.isArray(comment.assigned_owners)
    ? (comment.assigned_owners as PmsRecord[])
    : []
  const name = owners.length > 0 ? pmsField(owners[0], 'name') : ''
  return name.replace(/\s*\([^)]*\)\s*$/, '') || pmsField(comment, 'userid')
}

function filesOf(comment: PmsRecord): { name: string; url: string }[] {
  const files = Array.isArray(comment.file) ? (comment.file as unknown[]) : []
  return files
    .filter((file): file is PmsRecord => typeof file === 'object' && file !== null)
    .map((file) => ({ name: pmsField(file, 'name'), url: pmsField(file, 'path') }))
    .filter((file) => file.url.startsWith('https://'))
}

function toComment(comment: PmsRecord): PmsComment {
  const children = Array.isArray(comment.child_comment_list)
    ? (comment.child_comment_list as PmsRecord[])
    : []
  return {
    id: pmsField(comment, 'modcommentsid'),
    author: authorOf(comment),
    createdTime: pmsField(comment, 'createdtime'),
    text: pmsHtmlToText(pmsField(comment, 'commentcontent')),
    files: filesOf(comment),
    replies: children.map(toComment)
  }
}

/** Every comment on a ticket or task with its replies, oldest page first as PMS lists them. */
export async function pmsComments(id: unknown): Promise<PmsComment[]> {
  const recordId = IdSchema.parse(id)
  const pms = await connectedClient()
  const comments: PmsComment[] = []
  for (let offset = 0; ; offset += 50) {
    const data = await pms.cloudWork({
      RequestAction: 'getRelatedListCommentById',
      Params: { id: Number(recordId), paging: { offset, max_rows: 50 } }
    })
    const rows = Array.isArray(data.entry_list) ? (data.entry_list as PmsRecord[]) : []
    comments.push(...rows.map(toComment))
    const total = Number(pmsField((data.paging ?? {}) as PmsRecord, 'total_count'))
    if (rows.length < 50 || !(comments.length < total)) {
      return comments
    }
  }
}

/** Posts plain text as the connected user; line breaks survive as `<br>`. */
export async function addPmsComment(input: unknown): Promise<PmsComment[]> {
  const args = AddArgsSchema.parse(input)
  const pms = await connectedClient()
  const data = await pms.cloudWork({
    RequestAction: 'create',
    Module: 'ModComments',
    Data: {
      commentcontent: args.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r?\n/g, '<br>'),
      related_to: Number(args.id),
      parent_comments: args.parentId ? Number(args.parentId) : 0,
      assigned_user_id: Number(pms.user?.id)
    }
  })
  if (String(data.success ?? '1') === '0') {
    throw new Error(`PMS rejected the comment: ${pmsField(data, 'message') || 'unknown error'}`)
  }
  return pmsComments(args.id)
}
