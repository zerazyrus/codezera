import type { GitHistoryItem } from '../../../../shared/git/history/git-history-types'

export type GitGraphFindOptions = { caseSensitive: boolean; regex: boolean }

export type GitGraphFindMatcher = (item: GitHistoryItem) => boolean

/** VS Code Git Graph's Find: message, hash, author, email and ref names of loaded commits. */
export function createGitGraphFindMatcher(
  query: string,
  options: GitGraphFindOptions
): GitGraphFindMatcher | 'invalid' | null {
  if (!query) {
    return null
  }
  let test: (text: string) => boolean
  if (options.regex) {
    let pattern: RegExp
    try {
      pattern = new RegExp(query, options.caseSensitive ? 'u' : 'iu')
    } catch {
      return 'invalid'
    }
    test = (text) => pattern.test(text)
  } else {
    const needle = options.caseSensitive ? query : query.toLowerCase()
    test = (text) => (options.caseSensitive ? text : text.toLowerCase()).includes(needle)
  }
  return (item) =>
    test(item.message || item.subject) ||
    test(item.id) ||
    (item.author !== undefined && test(item.author)) ||
    (item.authorEmail !== undefined && test(item.authorEmail)) ||
    (item.references ?? []).some((ref) => test(ref.name))
}
