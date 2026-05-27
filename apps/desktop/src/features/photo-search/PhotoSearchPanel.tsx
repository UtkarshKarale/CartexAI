import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ArrowRight,
  Copy,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { ScrollArea } from '../../components/ui/scroll-area'
import { cn } from '../../lib/utils'
import type { SimilarImagesResponse, SimilarImageResult } from '../../shared/contracts'

interface PhotoSearchPanelProps {
  isOpen: boolean
  onClose: () => void
}

type SelectedFile = {
  file: File
  path: string
  previewUrl: string
}

export function PhotoSearchPanel({ isOpen, onClose }: PhotoSearchPanelProps) {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [searchScope, setSearchScope] = useState('')
  const [targetToOpen, setTargetToOpen] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<SimilarImagesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  const previewUrl = selectedFile?.previewUrl ?? null

  useEffect(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }

    if (!selectedFile) {
      return
    }

    previewUrlRef.current = selectedFile.previewUrl
  }, [selectedFile])

  const selectedFileName = useMemo(() => selectedFile?.file.name ?? 'No image selected', [selectedFile])

  if (!isOpen) return null

  const chooseFile = () => {
    fileInputRef.current?.click()
  }

  const setFileFromInput = (file?: File | null) => {
    if (!file) {
      return
    }

    const localFile = file as File & { path?: string }
    if (!localFile.path) {
      setError('Electron did not expose the local file path for this image.')
      return
    }

    const nextPreviewUrl = URL.createObjectURL(localFile)
    setSelectedFile({
      file: localFile,
      path: localFile.path,
      previewUrl: nextPreviewUrl,
    })
    setResult(null)
    setError(null)
  }

  const handleSearch = async () => {
    if (!selectedFile) {
      setError('Choose an image first.')
      return
    }

    setSearching(true)
    setError(null)
    try {
      const response = await window.desktopApi.findSimilarImages({
        imagePath: selectedFile.path,
        directory: searchScope.trim() || undefined,
        maxResults: 24,
      })
      setResult(response)
    } catch (searchError) {
      setResult(null)
      setError(searchError instanceof Error ? searchError.message : 'Unable to search images.')
    } finally {
      setSearching(false)
    }
  }

  const handleOpenTarget = async () => {
    const target = targetToOpen.trim()
    if (!target) {
      setError('Enter an app, file, folder, or URL first.')
      return
    }

    setError(null)
    try {
      await window.desktopApi.openTarget(target)
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open the target.')
    }
  }

  const handleOpenResult = async (item: SimilarImageResult) => {
    try {
      await window.desktopApi.openTarget(item.path)
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open the image.')
    }
  }

  const handleOpenFolder = async (item: SimilarImageResult) => {
    try {
      await window.desktopApi.openTarget(parentDirectory(item.path))
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open the folder.')
    }
  }

  const handleCopyPath = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      setError('Unable to copy the path.')
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    setFileFromInput(event.dataTransfer.files?.[0] ?? null)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/65 px-4 py-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] shadow-2xl">
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))]/90 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-[rgb(var(--accent))]" />
              Photo Finder
            </div>
            <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
              Search the whole computer and connected drives for similar photos, then open the match or the folder.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20 p-2 text-[rgb(var(--muted-foreground))] transition hover:bg-[rgb(var(--muted))]/40 hover:text-[rgb(var(--foreground))]"
            aria-label="Close photo finder"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[390px_1fr]">
          <div className="flex min-h-0 flex-col gap-4 overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))]/60 p-4">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Open anything</div>
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">Files, folders, apps, or URLs.</div>
                </div>
                <Badge variant="muted">system</Badge>
              </div>

              <div className="flex gap-2">
                <Input
                  value={targetToOpen}
                  onChange={(event) => setTargetToOpen(event.target.value)}
                  placeholder="Chrome, C:\\Photos\\img.jpg, or https://..."
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleOpenTarget()
                    }
                  }}
                />
                <Button type="button" onClick={() => void handleOpenTarget()} className="shrink-0">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <div className="text-sm font-semibold">Upload image</div>
                <div className="text-xs text-[rgb(var(--muted-foreground))]">Drag and drop a photo or pick one from disk.</div>
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={cn(
                  'flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed px-4 py-6 text-center transition',
                  dragActive
                    ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--muted))]/10 hover:bg-[rgb(var(--muted))]/20',
                )}
                onClick={chooseFile}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Selected image preview" className="max-h-44 w-full rounded-2xl object-contain" />
                ) : (
                  <>
                    <ImageIcon className="h-8 w-8 text-[rgb(var(--muted-foreground))]" />
                    <div className="mt-3 text-sm font-medium">{selectedFileName}</div>
                    <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
                      Drop an image here or click to browse.
                    </div>
                  </>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setFileFromInput(event.target.files?.[0] ?? null)}
              />

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={chooseFile} className="flex-1">
                  Choose image
                </Button>
                <Button type="button" onClick={() => void handleSearch()} disabled={searching || !selectedFile}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {searching ? 'Scanning…' : 'Find matches'}
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <div className="text-sm font-semibold">Search scope</div>
                <div className="text-xs text-[rgb(var(--muted-foreground))]">
                  Leave blank to scan mounted drives, USB disks, and common media folders.
                </div>
              </div>
              <Input
                value={searchScope}
                onChange={(event) => setSearchScope(event.target.value)}
                placeholder="Optional folder or drive root"
              />
            </section>

            <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--muted))]/10 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Query details</div>
                <Badge variant="outline">{result?.scannedCount ?? 0} scanned</Badge>
              </div>
              <div className="text-xs text-[rgb(var(--muted-foreground))]">
                {result?.queryOcr
                  ? `OCR hint: ${result.queryOcr.slice(0, 180)}${result.queryOcr.length > 180 ? '…' : ''}`
                  : 'OCR is used when the query image has readable text.'}
              </div>
              {result?.queryObjects?.length ? (
                <div className="flex flex-wrap gap-2">
                  {result.queryObjects.map((label) => (
                    <Badge key={label} variant="outline" className="capitalize">
                      {label}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {result?.roots?.length ? (
                <div className="flex flex-wrap gap-2">
                  {result.roots.slice(0, 6).map((root) => (
                    <Badge key={root} variant="muted" className="max-w-full truncate">
                      {root}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </section>

            {error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))]/60">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Matches</div>
                <div className="text-xs text-[rgb(var(--muted-foreground))]">
                  Ranked by perceptual hash, file name, and OCR text.
                </div>
              </div>
              <Badge variant="muted">{result?.results.length ?? 0}</Badge>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-4">
                {result?.results?.length ? (
                  result.results.map((item) => (
                    <ResultCard
                      key={item.path}
                      item={item}
                      onOpenImage={() => void handleOpenResult(item)}
                      onOpenFolder={() => void handleOpenFolder(item)}
                      onCopyPath={() => void handleCopyPath(item.path)}
                    />
                  ))
                ) : (
                  <EmptyResults onSearch={() => void handleSearch()} searching={searching} hasImage={Boolean(selectedFile)} />
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultCard({
  item,
  onOpenImage,
  onOpenFolder,
  onCopyPath,
}: {
  item: SimilarImageResult
  onOpenImage: () => void
  onOpenFolder: () => void
  onCopyPath: () => void
}) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))]/80 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{item.name}</div>
          <div className="mt-1 break-all text-xs text-[rgb(var(--muted-foreground))]">{item.path}</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Badge variant="outline">{Math.round(item.score * 100)}%</Badge>
          <Badge variant="muted">d {item.distance}</Badge>
        </div>
      </div>

      {item.ocrText ? (
        <div className="mt-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--muted))]/10 px-3 py-2 text-xs text-[rgb(var(--muted-foreground))]">
          {item.ocrText}
        </div>
      ) : null}

      {item.objects?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.objects.map((label) => (
            <Badge key={`${item.path}-${label}`} variant="muted" className="capitalize">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onOpenImage}>
          <ArrowRight className="h-3.5 w-3.5" />
          Open image
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onOpenFolder}>
          <FolderOpen className="h-3.5 w-3.5" />
          Open folder
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCopyPath}>
          <Copy className="h-3.5 w-3.5" />
          Copy path
        </Button>
      </div>
    </div>
  )
}

function EmptyResults({
  onSearch,
  searching,
  hasImage,
}: {
  onSearch: () => void
  searching: boolean
  hasImage: boolean
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--muted))]/10 px-6 py-10 text-center">
      <ImageIcon className="h-10 w-10 text-[rgb(var(--muted-foreground))]" />
      <div className="mt-4 text-sm font-semibold">{hasImage ? 'No matches yet' : 'Upload an image to begin'}</div>
      <div className="mt-2 max-w-sm text-xs leading-5 text-[rgb(var(--muted-foreground))]">
        The search uses image hashes and OCR first. If you still need a deeper answer, continue in chat and let AI be the last fallback.
      </div>
      {hasImage ? (
        <Button type="button" className="mt-4" onClick={onSearch} disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {searching ? 'Scanning…' : 'Search again'}
        </Button>
      ) : null}
    </div>
  )
}

function parentDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalized) return filePath

  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 2 && /^[A-Za-z]:$/.test(normalized.slice(0, 2))) {
    return `${normalized.slice(0, 2)}/`
  }

  if (lastSlash <= 0) {
    return normalized
  }

  return normalized.slice(0, lastSlash)
}
