import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * `codezera-package.mjs --review` stamps `codezeraFlavor: "review"` into the packaged package.json.
 * Read from disk instead of a build define so Orca's vite config stays untouched.
 */
export function isCodezeraReviewBuild(): boolean {
  if (!process.resourcesPath) {
    return false
  }
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(path.join(process.resourcesPath, 'app.asar', 'package.json'), 'utf8')
    )
    return (
      typeof manifest === 'object' &&
      manifest !== null &&
      'codezeraFlavor' in manifest &&
      manifest.codezeraFlavor === 'review'
    )
  } catch {
    return false
  }
}
