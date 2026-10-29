import type React from 'react'
import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import type { GitGraphBranch } from '../../../../shared/codezera/git-graph-types'

const MAX_LISTED_BRANCHES = 300

export function GitGraphBranchPicker({
  branches,
  selectedRefs,
  showRemoteBranches,
  onChange
}: {
  branches: readonly GitGraphBranch[]
  selectedRefs: string[] | null
  showRemoteBranches: boolean
  onChange: (refs: string[] | null) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = useMemo(() => new Set(selectedRefs ?? []), [selectedRefs])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return branches
      .filter(
        (branch) =>
          (showRemoteBranches || !branch.remote) &&
          (!needle || branch.name.toLowerCase().includes(needle))
      )
      .slice(0, MAX_LISTED_BRANCHES)
  }, [branches, query, showRemoteBranches])

  const toggle = (fullName: string): void => {
    const next = new Set(selected)
    if (next.has(fullName)) {
      next.delete(fullName)
    } else {
      next.add(fullName)
    }
    onChange(next.size > 0 ? [...next] : null)
  }

  const label =
    selectedRefs === null
      ? translate('codezera.gitGraph.branches.all', 'Show all')
      : selectedRefs.length === 1
        ? (branches.find((branch) => branch.fullName === selectedRefs[0])?.name ?? selectedRefs[0])
        : translate('codezera.gitGraph.branches.count', '{{count}} branches', {
            count: selectedRefs.length
          })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          role="combobox"
          aria-expanded={open}
          className="w-48 justify-between font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            placeholder={translate('codezera.gitGraph.branches.search', 'Search branches...')}
            value={query}
            onValueChange={setQuery}
            className="text-xs"
          />
          <div className="border-b border-border">
            <button
              type="button"
              onClick={() => onChange(null)}
              onMouseDown={(event) => event.preventDefault()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <Check
                className={cn(
                  'size-3 text-muted-foreground',
                  selectedRefs === null ? 'opacity-70' : 'opacity-0'
                )}
              />
              {translate('codezera.gitGraph.branches.all', 'Show all')}
            </button>
          </div>
          <CommandList>
            <CommandEmpty>
              {translate('codezera.gitGraph.branches.empty', 'No branches match.')}
            </CommandEmpty>
            {visible.map((branch) => (
              <CommandItem
                key={branch.fullName}
                value={branch.fullName}
                onSelect={() => toggle(branch.fullName)}
                className="items-center gap-2 px-3 py-1.5 text-xs"
              >
                <Check
                  className={cn(
                    'size-3 text-muted-foreground',
                    selected.has(branch.fullName) ? 'opacity-70' : 'opacity-0'
                  )}
                />
                <span className="truncate">{branch.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
