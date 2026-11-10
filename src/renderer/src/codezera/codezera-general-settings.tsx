import React from 'react'
import { matchesSettingsSearch } from '@/components/settings/search/settings-search'
import { ImportFromOrcaSetting } from './orca-import/import-from-orca'
import { CodezeraIndentationSetting } from './indentation/CodezeraIndentationSetting'
import { getCodezeraIndentationSearchEntries } from './indentation/indentation-settings-search'
import { CodezeraSnippetsSetting } from './snippets/CodezeraSnippetsSetting'
import { getCodezeraSnippetsSearchEntries } from './snippets/snippets-settings-search'
import { SftpImportAllSetting } from './sftp/sftp-import-all-setting'
import { getCodezeraSftpSearchEntries } from './sftp/sftp-settings-search'

/** Codezera's rows on Settings -> General; one hook in Orca's GeneralPane keeps upstream merges clean. */
export function CodezeraGeneralSettings({ query }: { query: string }): React.JSX.Element {
  const matches = matchesSettingsSearch(query, [
    ...getCodezeraIndentationSearchEntries(),
    ...getCodezeraSnippetsSearchEntries(),
    ...getCodezeraSftpSearchEntries()
  ])
  return (
    <>
      {matches ? (
        <div className="space-y-6">
          <CodezeraIndentationSetting />
          <CodezeraSnippetsSetting />
          <SftpImportAllSetting />
        </div>
      ) : null}
      <ImportFromOrcaSetting />
    </>
  )
}
