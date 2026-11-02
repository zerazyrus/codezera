import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type {
  CodezeraSnippetDraft,
  CodezeraSnippetEntry
} from '../../../../shared/codezera/snippets-types'
import { previewSnippetBody } from './snippet-body-preview'

type FormValues = {
  name: string
  prefixes: string
  languages: string
  include: string
  description: string
  body: string
}

type FieldErrors = Partial<Record<'name' | 'prefixes' | 'body', string>>

function commaList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function toDraft(values: FormValues, original: CodezeraSnippetEntry | null): CodezeraSnippetDraft {
  return {
    name: values.name.trim(),
    prefixes: commaList(values.prefixes),
    languages: commaList(values.languages),
    include: commaList(values.include),
    exclude: original?.exclude ?? [],
    description: values.description.trim(),
    body: values.body.replace(/\r\n?/g, '\n').split('\n')
  }
}

function validate(draft: CodezeraSnippetDraft, takenNames: ReadonlySet<string>): FieldErrors {
  const errors: FieldErrors = {}
  if (!draft.name) {
    errors.name = translate('codezera.snippets.nameRequired', 'Enter a name.')
  } else if (takenNames.has(draft.name)) {
    errors.name = translate(
      'codezera.snippets.nameTaken',
      'Another snippet in this file already uses this name.'
    )
  }
  if (draft.prefixes.length === 0) {
    errors.prefixes = translate('codezera.snippets.prefixRequired', 'Enter at least one prefix.')
  }
  if (!draft.body.join('').trim()) {
    errors.body = translate('codezera.snippets.bodyRequired', 'Enter the snippet body.')
  }
  return errors
}

function Field({
  id,
  label,
  hint,
  error,
  children
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function SnippetEditForm({
  original,
  file,
  takenNames,
  onSave,
  onCancel
}: {
  /** Null when adding a snippet. */
  original: CodezeraSnippetEntry | null
  file: string
  /** Other snippet names in `file`. */
  takenNames: ReadonlySet<string>
  onSave: (draft: CodezeraSnippetDraft) => Promise<void>
  onCancel: () => void
}): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() => ({
    name: original?.name ?? '',
    prefixes: original?.prefixes.join(', ') ?? '',
    languages: original?.languages.join(', ') ?? '',
    include: original?.include.join(', ') ?? '',
    description: original?.description ?? '',
    body: original?.body.join('\n') ?? ''
  }))
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const draft = toDraft(values, original)
  const errors = submitted ? validate(draft, takenNames) : {}
  const update =
    (key: keyof FormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
      setValues((current) => ({ ...current, [key]: event.target.value }))

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(validate(draft, takenNames)).length > 0) {
      return
    }
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-border p-4"
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onCancel()
        }
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold">
          {original
            ? translate('codezera.snippets.editTitle', 'Edit snippet')
            : translate('codezera.snippets.addTitle', 'New snippet')}
        </h4>
        <span className="truncate font-mono text-xs text-muted-foreground">{file}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="codezera-snippet-name"
          label={translate('codezera.snippets.name', 'Name')}
          error={errors.name}
        >
          <Input
            id="codezera-snippet-name"
            autoFocus
            value={values.name}
            aria-invalid={Boolean(errors.name)}
            onChange={update('name')}
          />
        </Field>
        <Field
          id="codezera-snippet-prefix"
          label={translate('codezera.snippets.prefix', 'Prefix')}
          hint={translate('codezera.snippets.prefixHint', 'Separate several prefixes with commas.')}
          error={errors.prefixes}
        >
          <Input
            id="codezera-snippet-prefix"
            className="font-mono"
            value={values.prefixes}
            aria-invalid={Boolean(errors.prefixes)}
            onChange={update('prefixes')}
          />
        </Field>
        <Field
          id="codezera-snippet-languages"
          label={translate('codezera.snippets.languages', 'Languages')}
          hint={translate(
            'codezera.snippets.languagesHint',
            'Language ids separated by commas, e.g. php, javascript. Empty = all languages.'
          )}
        >
          <Input
            id="codezera-snippet-languages"
            className="font-mono"
            value={values.languages}
            onChange={update('languages')}
          />
        </Field>
        <Field
          id="codezera-snippet-include"
          label={translate('codezera.snippets.include', 'Include files (optional)')}
          hint={translate(
            'codezera.snippets.includeHint',
            'Globs separated by commas, e.g. **/*.tpl. Matching files get the snippet in any language.'
          )}
        >
          <Input
            id="codezera-snippet-include"
            className="font-mono"
            value={values.include}
            onChange={update('include')}
          />
        </Field>
      </div>
      <Field
        id="codezera-snippet-description"
        label={translate('codezera.snippets.description', 'Description')}
      >
        <Input
          id="codezera-snippet-description"
          value={values.description}
          onChange={update('description')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="codezera-snippet-body"
          label={translate('codezera.snippets.body', 'Body')}
          hint={translate(
            'codezera.snippets.bodyHint',
            'VS Code snippet syntax: $1 tab stops, ${1:label} placeholders, $CURRENT_YEAR variables.'
          )}
          error={errors.body}
        >
          <Textarea
            id="codezera-snippet-body"
            variant="code"
            rows={8}
            spellCheck={false}
            wrap="off"
            className="text-xs md:text-xs"
            value={values.body}
            aria-invalid={Boolean(errors.body)}
            onChange={update('body')}
          />
        </Field>
        <div className="space-y-1.5">
          <Label>{translate('codezera.snippets.preview', 'Preview')}</Label>
          <pre className="scrollbar-sleek max-h-48 min-h-16 overflow-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre">
            {previewSnippetBody(draft.body.join('\n'))}
          </pre>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {translate('codezera.snippets.cancel', 'Cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {translate('codezera.snippets.save', 'Save')}
        </Button>
      </div>
    </form>
  )
}
