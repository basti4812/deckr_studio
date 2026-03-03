'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, LayoutTemplate, Loader2 } from 'lucide-react'
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
  const [currentIndex, setCurrentIndex] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const touchStartXRef = useRef<number | null>(null)

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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides.length])

  // Download PDF
  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/view/${shareToken}/pdf`, { method: 'POST' })
      if (!res.ok) {
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
      // Silently fail
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

  const slide = slides[currentIndex]

  if (!slide) return null

  return (
    <div
      className="flex min-h-screen flex-col bg-gray-50"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {tenantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenantLogoUrl}
              alt={tenantName}
              className="h-8 max-w-[120px] object-contain"
            />
          ) : (
            <span className="text-sm font-semibold text-gray-700 truncate">
              {tenantName}
            </span>
          )}
          <span className="hidden sm:block text-sm text-muted-foreground truncate">
            {projectName}
          </span>
        </div>

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
          Download PDF
        </Button>
      </header>

      {/* Slide canvas */}
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="relative w-full max-w-5xl aspect-video bg-white rounded-lg shadow-lg overflow-hidden">
          {slide.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.thumbnail_url}
              alt={slide.title}
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gray-100 text-gray-400">
              <LayoutTemplate className="h-16 w-16" />
              <p className="text-lg font-medium">{slide.title}</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation footer */}
      <footer className="flex items-center justify-center gap-4 border-t bg-white px-4 py-3">
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
