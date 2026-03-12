'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Download, LayoutTemplate, Loader2, Maximize2, Minimize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewerSlide {
  thumbnail_url: string | null
  title: string
}

interface ViewerSlideshowProps {
  slides: ViewerSlide[]
  projectName: string
  tenantName: string
  tenantLogoUrl: string | null
  tenantPrimaryColor: string
  shareToken: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ViewerSlideshow({
  slides,
  projectName,
  tenantName,
  tenantLogoUrl,
  tenantPrimaryColor,
  shareToken,
}: ViewerSlideshowProps) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFsUI, setShowFsUI] = useState(true)
  const touchStartXRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => {})
    }
  }, [])

  // Sync fullscreen state with browser
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement)
      setShowFsUI(true)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Cleanup hide timer
  useEffect(() => {
    return () => { if (fsHideTimer.current) clearTimeout(fsHideTimer.current) }
  }, [])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          setCurrentIndex((i) => Math.min(i + 1, slides.length - 1))
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          setCurrentIndex((i) => Math.max(i - 1, 0))
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen().catch(() => {})
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides.length, isFullscreen, toggleFullscreen])

  // Download PDF
  async function handleDownloadPdf() {
    setDownloading(true)
    setDownloadError(false)
    try {
      const res = await fetch(`/api/view/${shareToken}/pdf`, { method: 'POST' })
      if (!res.ok) {
        setDownloadError(true)
        setDownloading(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'presentation'}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError(true)
    }
    setDownloading(false)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartXRef.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartXRef.current
    touchStartXRef.current = null
    if (Math.abs(delta) < 50) return
    if (delta < 0) {
      setCurrentIndex((i) => Math.min(i + 1, slides.length - 1))
    } else {
      setCurrentIndex((i) => Math.max(i - 1, 0))
    }
  }

  function handleFsMouseMove() {
    if (!isFullscreen) return
    setShowFsUI(true)
    if (fsHideTimer.current) clearTimeout(fsHideTimer.current)
    fsHideTimer.current = setTimeout(() => setShowFsUI(false), 3000)
  }

  const slide = slides[currentIndex]

  if (!slide) return null

  // -------------------------------------------------------------------------
  // Fullscreen mode — cinematic edge-to-edge view
  // -------------------------------------------------------------------------
  if (isFullscreen) {
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 bg-black flex items-center justify-center"
        onMouseMove={handleFsMouseMove}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Slide — fills entire screen */}
        {slide.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.thumbnail_url}
            alt={slide.title}
            className="w-full h-full object-contain select-none"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-white/30">
            <LayoutTemplate className="h-24 w-24" />
            <p className="text-xl font-medium">{slide.title}</p>
          </div>
        )}

        {/* Overlay UI — fades after 3s */}
        <div className={`pointer-events-none fixed inset-0 z-[55] transition-opacity duration-500 ${showFsUI ? 'opacity-100' : 'opacity-0'}`}>
          {/* Top bar */}
          <div className="pointer-events-auto flex items-center justify-between p-4">
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-sm text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
            >
              <X className="h-4 w-4" />
              {t('viewer.exit')}
            </button>
            <span className="rounded-lg bg-black/60 px-3 py-2 text-sm text-white tabular-nums backdrop-blur-sm">
              {currentIndex + 1} / {slides.length}
            </span>
          </div>

          {/* Previous */}
          {currentIndex > 0 && (
            <button
              className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
              onClick={() => setCurrentIndex((i) => i - 1)}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Next */}
          {currentIndex < slides.length - 1 && (
            <button
              className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
              onClick={() => setCurrentIndex((i) => i + 1)}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Progress bar */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{
                width: `${((currentIndex + 1) / slides.length) * 100}%`,
                backgroundColor: tenantPrimaryColor,
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Normal (non-fullscreen) mode
  // -------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className="flex min-h-screen flex-col bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 shadow-warm-sm">
        <div className="flex items-center gap-3 min-w-0">
          {tenantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenantLogoUrl}
              alt={tenantName}
              className="h-8 max-w-[120px] object-contain"
            />
          ) : (
            <span className="text-sm font-semibold text-foreground truncate">
              {tenantName}
            </span>
          )}
          <span className="hidden sm:block text-sm text-muted-foreground truncate">
            {projectName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={toggleFullscreen}
            variant="outline"
            size="sm"
            title={t('viewer.fullscreen_tooltip')}
          >
            <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
            {t('viewer.fullscreen')}
          </Button>

          <Button
            onClick={handleDownloadPdf}
            disabled={downloading}
            size="sm"
            style={{ backgroundColor: tenantPrimaryColor, borderColor: tenantPrimaryColor }}
            className="text-white hover:opacity-90 transition-opacity"
          >
            {downloading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('viewer.download_pdf')}
          </Button>
        </div>
      </header>

      {/* Download error banner */}
      {downloadError && (
        <div className="flex items-center justify-center gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {t('viewer.pdf_failed')}
          <button
            onClick={() => setDownloadError(false)}
            className="ml-2 underline hover:no-underline"
          >
            {t('viewer.dismiss')}
          </button>
        </div>
      )}

      {/* Slide canvas — responsive, fills available space */}
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="relative w-full max-w-7xl aspect-video bg-card rounded-lg shadow-warm-lg overflow-hidden">
          {slide.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.thumbnail_url}
              alt={slide.title}
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-muted text-muted-foreground">
              <LayoutTemplate className="h-16 w-16" />
              <p className="text-lg font-medium">{slide.title}</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation footer */}
      <footer className="flex items-center justify-center gap-4 border-t bg-card px-4 py-3">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-sm tabular-nums text-muted-foreground min-w-[60px] text-center">
          {currentIndex + 1} / {slides.length}
        </span>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => setCurrentIndex((i) => Math.min(i + 1, slides.length - 1))}
          disabled={currentIndex === slides.length - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </footer>
    </div>
  )
}
