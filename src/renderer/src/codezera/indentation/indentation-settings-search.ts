import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getCodezeraIndentationSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('codezera.indentation.title', 'Indentation'),
    description: translate(
      'codezera.indentation.description',
      'Whether the editor indents with tabs or spaces, and how wide.'
    ),
    keywords: ['indent', 'indentation', 'tab', 'tabs', 'tab size', 'spaces', 'insert spaces']
  }
])
