import { isAbsolute, join, posix, relative, sep } from 'node:path'

/** Posix path of `localPath` relative to `localRoot` ('' for the root itself); throws when outside it. */
export function localRelativePath(localRoot: string, localPath: string): string {
  const rel = relative(localRoot, localPath)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${localPath} is outside the SFTP folder ${localRoot}`)
  }
  return sep === '/' ? rel : rel.split(sep).join('/')
}

export function localToRemotePath(
  localRoot: string,
  remoteRoot: string,
  localPath: string
): string {
  return posix.join(remoteRoot, localRelativePath(localRoot, localPath))
}

/** Posix path of `remotePath` relative to `remoteRoot` ('' for the root itself); throws when outside it. */
export function remoteRelativePath(remoteRoot: string, remotePath: string): string {
  const rel = posix.relative(remoteRoot, posix.normalize(remotePath))
  if (rel === '..' || rel.startsWith('../') || posix.isAbsolute(rel)) {
    throw new Error(`${remotePath} is outside remotePath ${remoteRoot}`)
  }
  return rel
}

export function remoteToLocalPath(
  localRoot: string,
  remoteRoot: string,
  remotePath: string
): string {
  const rel = remoteRelativePath(remoteRoot, remotePath)
  return rel === '' ? localRoot : join(localRoot, ...rel.split('/'))
}
