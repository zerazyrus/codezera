import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getCodezeraSnippetsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('codezera.snippets.sectionTitle', 'Snippets'),
    description: translate(
      'codezera.snippets.sectionDescription',
      'Code snippets offered as completions in the editor, stored on this computer.'
    ),
    keywords: ['snippet', 'snippets', 'completion', 'prefix', 'template', 'vscode', 'import']
  }
])
