import type React from 'react'
import { useMemo } from 'react'
import { FileText, Folder, Loader2, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { GitHistoryCommitFilesState } from '@/components/right-sidebar/source-control/sync/git-history-commit-files'
import type { GitHistoryItem } from '../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../shared/git-diff-compare-types'
import type { GitGraphLaneRef } from './git-graph-layout'
import { GitGraphLanesThrough } from './git-graph-lanes-svg'
import { GitGraphIssueText } from './git-graph-issue-text'
import type { GitGraphIssueLinking } from '../../../../shared/codezera/git-graph-types'

type TreeNode = {
  name: string
  path: string
  folders: Map<string, TreeNode>
  files: GitBranchChangeEntry[]
}

function buildTree(entries: readonly GitBranchChangeEntry[]): TreeNode {
  const root: TreeNode = { name: '', path: '', folders: new Map(), files: [] }
  for (const entry of entries) {
    const parts = entry.path.split('/')
    let node = root
    for (const part of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}/${part}` : part
      let next = node.folders.get(part)
      if (!next) {
        next = { name: part, path, folders: new Map(), files: [] }
        node.folders.set(part, next)
      }
      node = next
    }
    node.files.push(entry)
  }
  return root
}

const STATUS_COLOR: Record<string, string> = {
  added: 'text-emerald-500',
  deleted: 'text-red-500 line-through',
  renamed: 'text-sky-500'
}

function TreeLevel({
  node,
  depth,
  onOpenFile
}: {
  node: TreeNode
  depth: number
  onOpenFile: (entry: GitBranchChangeEntry, event: React.MouseEvent) => void
}): React.JSX.Element {
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name))
  const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path))
  return (
    <>
      {folders.map((folder) => (
        <div key={folder.path}>
          <div className="flex h-6 items-center gap-1.5" style={{ paddingLeft: depth * 16 }}>
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            <span>{folder.name}</span>
          </div>
          <TreeLevel node={folder} depth={depth + 1} onOpenFile={onOpenFile} />
        </div>
      ))}
      {files.map((entry) => (
        <button
          key={entry.path}
          type="button"
          data-testid="git-graph-commit-file"
          className="flex h-6 w-full min-w-0 items-center gap-1.5 text-left"
          style={{ paddingLeft: depth * 16 }}
          title={entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path}
          onClick={(event) => onOpenFile(entry, event)}
        >
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span
            className={`truncate text-sky-400 hover:underline ${STATUS_COLOR[entry.status] ?? ''}`}
          >
            {entry.path.split('/').pop()}
          </span>
          {entry.added !== undefined || entry.removed !== undefined ? (
            <span className="shrink-0 tabular-nums text-muted-foreground">
              (<span className="text-emerald-500">+{entry.added ?? 0}</span>
              {' | '}
              <span className="text-red-500">-{entry.removed ?? 0}</span>)
            </span>
          ) : null}
        </button>
      ))}
    </>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <span className="font-bold">{label}: </span>
      {children}
    </div>
  )
}

/** VS Code Git Graph's inline commit panel: facts on the left, changed-file tree on the right. */
export function GitGraphCommitDetails({
  item,
  files,
  lanes,
  graphWidth,
  onOpenFile,
  onOpenAll,
  onSelectCommit,
  onClose,
  issueLinking
}: {
  item: GitHistoryItem
  files: GitHistoryCommitFilesState
  lanes: readonly GitGraphLaneRef[]
  graphWidth: number
  onOpenFile: (entry: GitBranchChangeEntry, event: React.MouseEvent) => void
  onOpenAll: () => void
  onSelectCommit: (id: string) => void
  onClose: () => void
  issueLinking: GitGraphIssueLinking | null
}): React.JSX.Element {
  const tree = useMemo(() => (files.status === 'ready' ? buildTree(files.entries) : null), [files])
  return (
    <div
      className="relative border-y border-border bg-muted/40"
      data-testid="git-graph-commit-details"
    >
      <GitGraphLanesThrough lanes={lanes} width={graphWidth} />
      <div
        className="grid min-h-40 grid-cols-2 border-l border-border"
        style={{ marginLeft: graphWidth }}
      >
        <div className="scrollbar-sleek select-text space-y-0.5 overflow-auto p-3 leading-6">
          <Field label={translate('codezera.gitGraph.details.commit', 'Commit')}>{item.id}</Field>
          {item.parentIds.length > 0 ? (
            <Field label={translate('codezera.gitGraph.details.parents', 'Parents')}>
              {item.parentIds.map((parent, index) => (
                <span key={parent}>
                  {index > 0 ? ', ' : null}
                  <button
                    type="button"
                    className="text-sky-400 hover:underline"
                    onClick={() => onSelectCommit(parent)}
                  >
                    {parent}
                  </button>
                </span>
              ))}
            </Field>
          ) : null}
          <Field label={translate('codezera.gitGraph.details.author', 'Author')}>
            {item.author}
            {item.authorEmail ? (
              <>
                {' <'}
                <a className="text-sky-400 hover:underline" href={`mailto:${item.authorEmail}`}>
                  {item.authorEmail}
                </a>
                {'>'}
              </>
            ) : null}
          </Field>
          {item.timestamp ? (
            <Field label={translate('codezera.gitGraph.details.date', 'Date')}>
              {new Date(item.timestamp).toString()}
            </Field>
          ) : null}
          <pre className="whitespace-pre-wrap pt-3 font-sans">
            <GitGraphIssueText text={item.message.trim()} linking={issueLinking} />
          </pre>
        </div>
        <div className="scrollbar-sleek max-h-80 min-w-0 overflow-auto border-l border-border py-2 pl-3 pr-9">
          {files.status === 'loading' ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : files.status === 'error' ? (
            <div className="text-destructive">{files.error}</div>
          ) : tree ? (
            <>
              <TreeLevel node={tree} depth={0} onOpenFile={onOpenFile} />
              {files.entries.length > 1 ? (
                <button
                  type="button"
                  className="mt-2 text-sky-400 hover:underline"
                  onClick={onOpenAll}
                >
                  {translate('codezera.gitGraph.details.openAll', 'Open all changes together')}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        aria-label={translate('codezera.gitGraph.details.close', 'Close commit details')}
        className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={onClose}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
