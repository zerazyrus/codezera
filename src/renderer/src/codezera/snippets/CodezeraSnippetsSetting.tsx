import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SearchableSetting } from '@/components/settings/section-layout/SearchableSetting'
import { SettingsSubsectionHeader } from '@/components/settings/form-controls/SettingsFormControls'
import { translate } from '@/i18n/i18n'
import {
  CODEZERA_MANAGED_SNIPPET_FILE,
  type CodezeraSnippetDraft,
  type CodezeraSnippetEntry
} from '../../../../shared/codezera/snippets-types'
import { SnippetEditForm } from './snippet-edit-form'
import { getCodezeraSnippetsSearchEntries } from './snippets-settings-search'

// `undefined` = list view, `null` = adding a snippet.
type EditTarget = CodezeraSnippetEntry | null | undefined

function errorMessage(error: unknown): string {
  // IPC prefixes remote errors; show only the reason.
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function matchesQuery(entry: CodezeraSnippetEntry, query: string): boolean {
  if (!query) {
    return true
  }
  return [entry.name, entry.description, entry.file, ...entry.prefixes, ...entry.languages].some(
    (value) => value.toLowerCase().includes(query)
  )
}

function useSnippetEntries(): {
  entries: CodezeraSnippetEntry[] | null
  error: string | null
  reload: () => void
} {
  const [entries, setEntries] = useState<CodezeraSnippetEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    window.api.codezera.snippets
      .listEntries()
      .then((next) => {
        setEntries(next)
        setError(null)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])
  useEffect(() => {
    reload()
    return window.api.codezera.snippets.onChanged(reload)
  }, [reload])
  return { entries, error, reload }
}

function ImportFromVscodeButton(): React.JSX.Element {
  const [running, setRunning] = useState(false)
  const run = async (): Promise<void> => {
    setRunning(true)
    try {
      const result = await window.api.codezera.snippets.importFromVscode()
      if (!result.sourceFound) {
        toast.error(
          translate('codezera.snippets.importMissing', 'No VS Code snippets folder at {{path}}.', {
            path: result.sourceDir
          })
        )
      } else if (result.importedFiles.length > 0) {
        toast.success(
          translate(
            'codezera.snippets.importDone',
            'Imported {{count}} snippets from {{files}} VS Code files.',
            { count: result.importedSnippets, files: result.importedFiles.length }
          )
        )
      } else {
        toast.info(
          result.unchangedFiles.length > 0
            ? translate(
                'codezera.snippets.importUnchanged',
                'VS Code snippets are already imported; nothing changed.'
              )
            : translate('codezera.snippets.importEmpty', 'VS Code has no snippet files to import.')
        )
      }
    } catch (error) {
      toast.error(
        translate(
          'codezera.snippets.importFailed',
          'Could not import VS Code snippets: {{message}}',
          {
            message: errorMessage(error)
          }
        )
      )
    } finally {
      setRunning(false)
    }
  }
  return (
    <Button variant="outline" size="sm" disabled={running} onClick={() => void run()}>
      {running ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      {translate('codezera.snippets.import', 'Import from VS Code')}
    </Button>
  )
}

function DeleteSnippetDialog({
  entry,
  onCancel,
  onConfirm
}: {
  entry: CodezeraSnippetEntry | null
  onCancel: () => void
  onConfirm: (entry: CodezeraSnippetEntry) => Promise<void>
}): React.JSX.Element {
  const [deleting, setDeleting] = useState(false)
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && !deleting && onCancel()}>
      <DialogContent className="max-w-md" showCloseButton={!deleting}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('codezera.snippets.deleteTitle', 'Delete snippet?')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'codezera.snippets.deleteDescription',
              '“{{name}}” is removed from {{file}}. This cannot be undone.',
              { name: entry?.name ?? '', file: entry?.file ?? '' }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={deleting} onClick={onCancel}>
            {translate('codezera.snippets.cancel', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => {
              if (!entry) {
                return
              }
              setDeleting(true)
              void onConfirm(entry).finally(() => setDeleting(false))
            }}
          >
            {deleting ? <Loader2 className="animate-spin" /> : null}
            {translate('codezera.snippets.delete', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SnippetRow({
  entry,
  onEdit,
  onDelete
}: {
  entry: CodezeraSnippetEntry
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <tr className="group border-b border-border last:border-b-0 hover:bg-accent">
      <td className="py-1.5 pr-3 pl-3 align-top font-mono text-xs">{entry.prefixes.join(', ')}</td>
      <td className="py-1.5 pr-3 align-top">
        <div className="text-sm">{entry.name}</div>
        {entry.description ? (
          <div className="text-xs text-muted-foreground">{entry.description}</div>
        ) : null}
      </td>
      <td className="py-1.5 pr-3 align-top font-mono text-xs text-muted-foreground">
        {entry.languages.length > 0
          ? entry.languages.join(', ')
          : translate('codezera.snippets.allLanguages', 'All languages')}
      </td>
      <td className="py-1 pr-2 align-top">
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={translate('codezera.snippets.edit', 'Edit')}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={translate('codezera.snippets.delete', 'Delete')}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </td>
    </tr>
  )
}

/** Settings section for Codezera's own snippet files; VS Code's are only read on explicit import. */
export function CodezeraSnippetsSetting(): React.JSX.Element {
  const [searchEntry] = getCodezeraSnippetsSearchEntries()
  const { entries, error, reload } = useSnippetEntries()
  const [query, setQuery] = useState('')
  const [editTarget, setEditTarget] = useState<EditTarget>(undefined)
  const [pendingDelete, setPendingDelete] = useState<CodezeraSnippetEntry | null>(null)
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (entries ?? []).filter((entry) => matchesQuery(entry, normalized))
  }, [entries, query])

  const editFile = editTarget?.file ?? CODEZERA_MANAGED_SNIPPET_FILE
  const takenNames = useMemo(
    () =>
      new Set(
        (entries ?? [])
          .filter((entry) => entry.file === editFile && entry.name !== editTarget?.name)
          .map((entry) => entry.name)
      ),
    [entries, editFile, editTarget]
  )

  const save = async (draft: CodezeraSnippetDraft): Promise<void> => {
    try {
      await window.api.codezera.snippets.save({
        file: editTarget?.file ?? null,
        originalName: editTarget?.name ?? null,
        snippet: draft
      })
      setEditTarget(undefined)
      reload()
    } catch (err) {
      toast.error(
        translate('codezera.snippets.saveFailed', 'Could not save the snippet: {{message}}', {
          message: errorMessage(err)
        })
      )
    }
  }

  const remove = async (entry: CodezeraSnippetEntry): Promise<void> => {
    try {
      await window.api.codezera.snippets.delete({ file: entry.file, name: entry.name })
      setPendingDelete(null)
      reload()
    } catch (err) {
      toast.error(
        translate('codezera.snippets.deleteFailed', 'Could not delete the snippet: {{message}}', {
          message: errorMessage(err)
        })
      )
    }
  }

  return (
    <SearchableSetting
      title={searchEntry.title}
      description={searchEntry.description}
      keywords={searchEntry.keywords}
      className="space-y-3"
    >
      <SettingsSubsectionHeader
        title={searchEntry.title}
        description={searchEntry.description}
        action={<ImportFromVscodeButton />}
      />
      {editTarget !== undefined ? (
        <SnippetEditForm
          key={editTarget ? `${editTarget.file}:${editTarget.name}` : 'new'}
          original={editTarget}
          file={editFile}
          takenNames={takenNames}
          onSave={save}
          onCancel={() => setEditTarget(undefined)}
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={translate('codezera.snippets.search', 'Search snippets')}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={() => setEditTarget(null)}>
              <Plus className="size-3.5" />
              {translate('codezera.snippets.add', 'Add snippet')}
            </Button>
          </div>
          {error ? (
            <p className="text-xs text-destructive">
              {translate('codezera.snippets.loadFailed', 'Could not read snippets: {{message}}', {
                message: error
              })}
            </p>
          ) : entries === null ? null : entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              {translate(
                'codezera.snippets.empty',
                'No snippets yet. Add one, or import your VS Code snippets.'
              )}
            </p>
          ) : (
            <div className="scrollbar-sleek max-h-96 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
                    <th className="py-1.5 pr-3 pl-3 font-semibold">
                      {translate('codezera.snippets.prefix', 'Prefix')}
                    </th>
                    <th className="py-1.5 pr-3 font-semibold">
                      {translate('codezera.snippets.name', 'Name')}
                    </th>
                    <th className="py-1.5 pr-3 font-semibold">
                      {translate('codezera.snippets.languages', 'Languages')}
                    </th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry) => (
                    <SnippetRow
                      key={`${entry.file}:${entry.name}`}
                      entry={entry}
                      onEdit={() => setEditTarget(entry)}
                      onDelete={() => setPendingDelete(entry)}
                    />
                  ))}
                </tbody>
              </table>
              {visible.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {translate('codezera.snippets.noMatch', 'No snippets match “{{query}}”.', {
                    query: query.trim()
                  })}
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
      <DeleteSnippetDialog
        entry={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={remove}
      />
    </SearchableSetting>
  )
}
