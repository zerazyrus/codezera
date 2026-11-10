import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IdSchema, getPmsItem } from './pms-service'

export type PmsDownloadedImage = { name: string; url: string; path: string }

const DOWNLOAD_TIMEOUT_MS = 30_000

/** Saves a ticket's attached images under the OS temp dir so agents can open them as local files. */
export async function downloadPmsTicketImages(ticketId: unknown): Promise<PmsDownloadedImage[]> {
  const id = IdSchema.parse(ticketId)
  const detail = await getPmsItem({ kind: 'ticket', id })
  const images = detail.ticket?.images ?? []
  const dir = join(tmpdir(), 'codezera-pms', `ticket-${id}`)
  await mkdir(dir, { recursive: true })
  return Promise.all(
    images.map(async (image, index) => {
      const response = await fetch(image.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
      if (!response.ok) {
        throw new Error(`Downloading ${image.name} failed: HTTP ${response.status}`)
      }
      const base = decodeURIComponent(new URL(image.url).pathname.split('/').pop() ?? '')
      const file = `${index + 1}-${base.replace(/[^\w.-]+/g, '_') || 'image'}`
      const path = join(dir, file)
      await writeFile(path, Buffer.from(await response.arrayBuffer()))
      return { name: image.name, url: image.url, path }
    })
  )
}
