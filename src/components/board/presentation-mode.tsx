'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, LayoutTemplate, X } from 'lucide-react'

export interface PresentationSlide {
  thumbnail_url: string | null
  title: string
}

interface PresentationModeProps {
  slides: PresentationSlide[]
  onExit: () => void
}

export function PresentationMode({ slides, onExit }: PresentationModeProps) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showUI, setShowUI] = useState(true)
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onExitRef = useRef(onExit)
  const touchStartXRef = useRef<number | null>(null)
  useEffect(() => { onExitRef.current = onExit }, [onExit])

  // Enter fullscreen on mount; exit on unmount
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.requestFullscreen?.().catch(() => {
      // Fallback: fixed overlay already covers the screen
    })
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [])

  // Exit when the browser exits fullscreen (e.g. user presses Escape in fullscreen mode)
  useEffect(() => {
    function onFsChange() {
      if (!document.fullscreenElement) {
        onExitRef.current()
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
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
        case 'Escape':
          // In non-fullscreen fallback: the browser won't auto-exit, so we handle it
          if (!document.fullscreenElement) onExitRef.current()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides.length])

  // Cleanup hide timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  function handleMouseMove(e: React.MouseEvent) {
    setShowUI(true)
    setLaserPos({ x: e.clientX, y: e.clientY })
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      setShowUI(false)
      setLaserPos(null)
    }, 3000)
  }

  function handleExit() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => onExitRef.current())
    } else {
      onExitRef.current()
    }
  }

  function advance() {
    setCurrentIndex((i) => Math.min(i + 1, slides.length - 1))
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

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onMouseMove={handleMouseMove}
      onClick={advance}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Current slide */}
      {slide.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slide.thumbnail_url}
          alt={slide.title}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
        />
      ) : (
        <div className="flex flex-col items-center gap-4 text-white/30">
          <LayoutTemplate className="h-24 w-24" />
          <p className="text-xl font-medium">{slide.title}</p>
        </div>
      )}

      {/* Laser pointer dot */}
      {laserPos && (
        <div
          className="pointer-events-none fixed z-[60] h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_12px_4px_rgba(239,68,68,0.5)]"
          style={{ left: laserPos.x, top: laserPos.y }}
        />
      )}

      {/* Navigation overlay — fades out after 3 s of inactivity */}
      <div
        className={`pointer-events-none fixed inset-0 z-[55] transition-opacity duration-500 ${
          showUI ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top bar: exit + progress */}
        <div className="pointer-events-auto flex items-center justify-between p-4">
          <button
            className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-sm text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
            onClick={(e) => { e.stopPropagation(); handleExit() }}
            title={t('presentation.exit_tooltip')}
          >
            <X className="h-4 w-4" />
            {t('presentation.exit')}
          </button>
          <span className="rounded-lg bg-black/60 px-3 py-2 text-sm text-white tabular-nums backdrop-blur-sm">
            {currentIndex + 1} / {slides.length}
          </span>
        </div>

        {/* Previous */}
        {currentIndex > 0 && (
          <button
            className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
            onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => i - 1) }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Next */}
        {currentIndex < slides.length - 1 && (
          <button
            className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
            onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => i + 1) }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {/* Progress dots — shown for ≤20 slides, 44px touch targets */}
        {slides.length <= 20 && (
          <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 flex">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(i) }}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] p-0"
              >
                <span className={`block h-1.5 rounded-full transition-all ${
                  i === currentIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                }`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
