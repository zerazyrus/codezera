import type React from 'react'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'
import { CkitAccountsSection, CKIT_SEARCH_KEYWORDS } from './ckit/CkitAccountsSection'

/**
 * Codezera's sections of Settings → Accounts, one entry each so the pane separates them like its own.
 * They read this computer's files (omp config), so paired web clients get none.
 */
export function codezeraAccountsSections(searchQuery: string): (React.JSX.Element | null)[] {
  if (isWebClientLocation()) {
    return []
  }
  const query = searchQuery.trim().toLowerCase()
  return [
    !query || CKIT_SEARCH_KEYWORDS.some((keyword) => keyword.includes(query)) ? (
      <CkitAccountsSection key="ckit" />
    ) : null
  ]
}
