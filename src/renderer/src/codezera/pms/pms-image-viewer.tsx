import React from 'react'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

type PmsImage = { name: string; url: string }

/** Ticket attachments shown large in the app; ←/→ step through them. */
export function PmsImageViewer({
  images,
  index,
  onIndexChange
}: {
  images: PmsImage[]
  index: number | null
  onIndexChange: (index: number | null) => void
}): React.JSX.Element {
  const image = index === null ? null : images[index]
  const step = (delta: number): void => {
    if (index !== null) {
      onIndexChange((index + delta + images.length) % images.length)
    }
  }
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent
        className="flex max-h-[calc(100vh-4rem)] flex-col gap-3 p-4 sm:max-w-[min(90vw,1200px)]"
        onKeyDown={(event) => {
          if (images.length > 1 && event.key === 'ArrowLeft') {
            step(-1)
          } else if (images.length > 1 && event.key === 'ArrowRight') {
            step(1)
          }
        }}
      >
        <div className="flex items-center gap-2 pr-8">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium">
            {image?.name}
          </DialogTitle>
          {images.length > 1 && index !== null ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {index + 1}/{images.length}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => image && void window.api.shell.openUrl(image.url)}
          >
            <ExternalLink className="size-3.5" />
            {translate('codezera.pms.openInBrowser', 'Open in browser')}
          </Button>
        </div>
        <DialogDescription className="sr-only">
          {translate('codezera.pms.field.images', 'Images')}
        </DialogDescription>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {image ? (
            <img
              src={image.url}
              alt={image.name}
              className="max-h-[calc(100vh-10rem)] max-w-full rounded-md object-contain"
            />
          ) : null}
          {images.length > 1 ? (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-1 rounded-full opacity-80"
                aria-label={translate('codezera.pms.previousImage', 'Previous image')}
                onClick={() => step(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-1 rounded-full opacity-80"
                aria-label={translate('codezera.pms.nextImage', 'Next image')}
                onClick={() => step(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
