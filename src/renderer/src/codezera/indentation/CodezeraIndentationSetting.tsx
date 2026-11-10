import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SearchableSetting } from '@/components/settings/section-layout/SearchableSetting'
import { translate } from '@/i18n/i18n'
import { getCodezeraIndentationSearchEntries } from './indentation-settings-search'
import { clampTabSize, MAX_TAB_SIZE, MIN_TAB_SIZE, useIndentationStore } from './indentation-store'

/** Settings row: default indentation style and width for the editor. */
export function CodezeraIndentationSetting(): React.JSX.Element {
  const [entry] = getCodezeraIndentationSearchEntries()
  const insertSpaces = useIndentationStore((s) => s.insertSpaces)
  const tabSize = useIndentationStore((s) => s.tabSize)
  const detectFromContent = useIndentationStore((s) => s.detectFromContent)
  const update = useIndentationStore((s) => s.update)
  return (
    <SearchableSetting {...entry!} className="space-y-3 py-2">
      <div className="space-y-1">
        <Label>{entry!.title}</Label>
        <p className="text-xs text-muted-foreground">{entry!.description}</p>
      </div>
      <div className="flex items-center gap-3">
        <Select
          value={insertSpaces ? 'spaces' : 'tabs'}
          onValueChange={(value) => update({ insertSpaces: value === 'spaces' })}
        >
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tabs">{translate('codezera.indentation.tabs', 'Tabs')}</SelectItem>
            <SelectItem value="spaces">
              {translate('codezera.indentation.spaces', 'Spaces')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Label htmlFor="codezera-indentation-size" className="text-xs text-muted-foreground">
          {translate('codezera.indentation.size', 'Size')}
        </Label>
        <Input
          id="codezera-indentation-size"
          type="number"
          min={MIN_TAB_SIZE}
          max={MAX_TAB_SIZE}
          value={tabSize}
          onChange={(event) => {
            const value = Number(event.target.value)
            if (event.target.value !== '' && Number.isFinite(value)) {
              update({ tabSize: clampTabSize(value) })
            }
          }}
          className="h-8 w-16"
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="codezera-indentation-detect">
            {translate('codezera.indentation.detect', 'Detect from file content')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'codezera.indentation.detectHint',
              'On: each file keeps the indentation it already uses. Off: every file indents with the setting above.'
            )}
          </p>
        </div>
        <Switch
          id="codezera-indentation-detect"
          checked={detectFromContent}
          onCheckedChange={(checked) => update({ detectFromContent: checked })}
        />
      </div>
    </SearchableSetting>
  )
}
