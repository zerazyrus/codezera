import type React from 'react'
import { useCallback } from 'react'
import { CaseSensitive, ChevronDown, ChevronUp, Regex, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { ImeInput } from '@/lib/text-input/ime/ime-text-field'
import { Button } from '@/components/ui/button'
import type { GitGraphFindOptions } from './git-graph-find'

function FindIconButton({
  label,
  pressed,
  disabled,
  onClick,
  children
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('shrink-0 text-muted-foreground', pressed && 'bg-accent text-foreground')}
    >
      {children}
    </Button>
  )
}

export type GitGraphFindBarProps = {
  /** Changes on every Find request; remounting the input refocuses and selects the query. */
  focusToken: number
  query: string
  options: GitGraphFindOptions
  matchCount: number
  currentIndex: number
  invalid: boolean
  onQueryChange: (query: string) => void
  onOptionsChange: (options: GitGraphFindOptions) => void
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
}

export function GitGraphFindBar({
  focusToken,
  query,
  options,
  matchCount,
  currentIndex,
  invalid,
  onQueryChange,
  onOptionsChange,
  onNext,
  onPrevious,
  onClose
}: GitGraphFindBarProps): React.JSX.Element {
  const focusInput = useCallback((input: HTMLInputElement | null) => {
    input?.focus()
    input?.select()
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      onClose()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) {
        onPrevious()
      } else {
        onNext()
      }
    }
  }

  const status = invalid
    ? translate('codezera.gitGraph.find.invalid', 'Invalid regex')
    : matchCount > 0
      ? translate('codezera.gitGraph.find.count', '{{current}} of {{total}}', {
          current: currentIndex + 1,
          total: matchCount
        })
      : translate('codezera.gitGraph.find.none', 'No results')

  return (
    <div
      data-testid="git-graph-find"
      className="absolute top-11 right-2 z-20 flex w-[380px] items-center gap-0.5 rounded-md border border-border bg-popover px-2 py-1 shadow-md"
      onKeyDown={handleKeyDown}
    >
      <ImeInput
        key={focusToken}
        ref={focusInput}
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={translate(
          'codezera.gitGraph.find.placeholder',
          'Find commit message, hash, author, branch or tag'
        )}
        className={cn(
          'min-w-0 flex-1 border-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground',
          invalid && 'text-destructive'
        )}
      />
      {query ? (
        <span
          className={cn(
            'shrink-0 px-1 text-xs tabular-nums text-muted-foreground',
            invalid && 'text-destructive'
          )}
        >
          {status}
        </span>
      ) : null}
      <FindIconButton
        label={translate('codezera.gitGraph.find.caseSensitive', 'Match Case')}
        pressed={options.caseSensitive}
        onClick={() => onOptionsChange({ ...options, caseSensitive: !options.caseSensitive })}
      >
        <CaseSensitive />
      </FindIconButton>
      <FindIconButton
        label={translate('codezera.gitGraph.find.regex', 'Use Regular Expression')}
        pressed={options.regex}
        onClick={() => onOptionsChange({ ...options, regex: !options.regex })}
      >
        <Regex />
      </FindIconButton>
      <FindIconButton
        label={translate('codezera.gitGraph.find.previous', 'Previous match (Shift+Enter)')}
        disabled={matchCount === 0}
        onClick={onPrevious}
      >
        <ChevronUp />
      </FindIconButton>
      <FindIconButton
        label={translate('codezera.gitGraph.find.next', 'Next match (Enter)')}
        disabled={matchCount === 0}
        onClick={onNext}
      >
        <ChevronDown />
      </FindIconButton>
      <FindIconButton
        label={translate('codezera.gitGraph.find.close', 'Close (Escape)')}
        onClick={onClose}
      >
        <X />
      </FindIconButton>
    </div>
  )
}
