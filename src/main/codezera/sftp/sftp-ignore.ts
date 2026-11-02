type IgnoreRule = { regex: RegExp; negate: boolean; directoryOnly: boolean }

/** Escapes everything except glob syntax, which becomes the gitignore equivalent. */
function globToRegexSource(glob: string): string {
  let source = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!
    if (char === '*' && glob[i + 1] === '*') {
      // `**/` spans zero or more folders; a bare `**` spans anything.
      if (glob[i + 2] === '/') {
        source += '(?:.*/)?'
        i += 2
      } else {
        source += '.*'
        i += 1
      }
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return source
}

function compileRule(pattern: string): IgnoreRule | null {
  let body = pattern.trim()
  if (!body || body.startsWith('#')) {
    return null
  }
  const negate = body.startsWith('!')
  if (negate) {
    body = body.slice(1)
  }
  const directoryOnly = body.endsWith('/')
  body = body.replace(/\/+$/, '')
  // gitignore: a slash at the start or middle anchors the pattern to the root.
  const anchored = body.includes('/')
  body = body.replace(/^\/+/, '')
  if (!body) {
    return null
  }
  const prefix = anchored ? '^' : '^(?:.*/)?'
  return { regex: new RegExp(`${prefix}${globToRegexSource(body)}$`), negate, directoryOnly }
}

/**
 * Gitignore-style matching (as natizyskunk.sftp's `ignore`) on paths relative to the SFTP root.
 * An ignored folder ignores everything under it.
 */
export function createSftpIgnoreMatcher(
  patterns: readonly string[]
): (relativePath: string, isDirectory: boolean) => boolean {
  const rules = patterns.map(compileRule).filter((rule): rule is IgnoreRule => rule !== null)
  const matches = (path: string, isDirectory: boolean): boolean => {
    let ignored = false
    for (const rule of rules) {
      if ((!rule.directoryOnly || isDirectory) && rule.regex.test(path)) {
        ignored = !rule.negate
      }
    }
    return ignored
  }
  return (relativePath, isDirectory) => {
    const segments = relativePath.split('/').filter(Boolean)
    for (let i = 1; i < segments.length; i++) {
      if (matches(segments.slice(0, i).join('/'), true)) {
        return true
      }
    }
    return segments.length > 0 && matches(segments.join('/'), isDirectory)
  }
}
