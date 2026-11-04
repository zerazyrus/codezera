import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translateSearchKeyword } from '@/components/settings/search/settings-search-keywords'

export const getCodezeraSftpSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('codezera.sftp.settingTitle', 'SFTP'),
    description: translate(
      'codezera.sftp.settingDescription',
      "Copy every workspace's .vscode/sftp.json into Codezera's SFTP settings once."
    ),
    keywords: [
      ...translateSearchKeyword('codezera.sftp.keywordImport', 'import', {
        aliases: ['sftp', 'vscode', 'ssh']
      }),
      ...translateSearchKeyword('codezera.sftp.keywordUpload', 'upload'),
      ...translateSearchKeyword('codezera.sftp.keywordServer', 'server'),
      ...translateSearchKeyword('codezera.sftp.keywordDeploy', 'deploy')
    ]
  }
])
