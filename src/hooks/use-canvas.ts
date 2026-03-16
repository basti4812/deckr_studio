import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

const MIN_ZOOM = 0.08
const MAX_ZOOM = 100 // effectively unlimited — let users zoom as deep as they want
const ZOOM_STEP = 0.08

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export interface CanvasState {
  zoom: number
  panX: number
  panY: number
}

interface Camera {
  zoom: number
  panX: number
  panY: number
}

export function useCanvas(initialZoom = 0.5, containerRef?: RefObject<HTMLDivElement | null>) {
  // Single atomic state object — avoids side-effect-in-updater bug that caused
  // zoom drift when setPanX/setPanY were called inside setZoom updaters.
  const [camera, setCamera] = useState<Camera>({ zoom: initialZoom, panX: 0, panY: 0 })

  // Drag state stored in a ref to avoid stale closure issues in event handlers
  const dragging = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  // -------------------------------------------------------------------------
  // Zoom helpers — zoom toward viewport center (like Miro/Figma)
  // -------------------------------------------------------------------------

  const zoomIn = useCallback(() => {
    const el = containerRef?.current
    const cx = el ? el.clientWidth / 2 : 0
    const cy = el ? el.clientHeight / 2 : 0
    setCamera((cam) => {
      const newZoom = clamp(cam.zoom * (1 + ZOOM_STEP), MIN_ZOOM, MAX_ZOOM)
      const ratio = newZoom / cam.zoom
      return {
        zoom: newZoom,
        panX: cx - ratio * (cx - cam.panX),
        panY: cy - ratio * (cy - cam.panY),
      }
    })
  }, [containerRef])

  const zoomOut = useCallback(() => {
    const el = containerRef?.current
    const cx = el ? el.clientWidth / 2 : 0
    const cy = el ? el.clientHeight / 2 : 0
    setCamera((cam) => {
      const newZoom = clamp(cam.zoom * (1 - ZOOM_STEP), MIN_ZOOM, MAX_ZOOM)
      const ratio = newZoom / cam.zoom
      return {
        zoom: newZoom,
        panX: cx - ratio * (cx - cam.panX),
        panY: cy - ratio * (cy - cam.panY),
      }
    })
  }, [containerRef])

  /**
   * Fit all slides in the viewport.
   * worldW/worldH = dimensions of the canvas world div in pixels (at zoom=1).
   * containerW/containerH = dimensions of the outer viewport div.
   */
  const fitToScreen = useCallback(
    (worldW: number, worldH: number, containerW: number, containerH: number) => {
      const padding = 80
      const zoomX = (containerW - padding) / worldW
      const zoomY = (containerH - padding) / worldH
      const newZoom = clamp(Math.min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM)

      // Center the world
      const scaledW = worldW * newZoom
      const scaledH = worldH * newZoom
      const newPanX = (containerW - scaledW) / 2
      const newPanY = (containerH - scaledH) / 2

      setCamera({ zoom: newZoom, panX: newPanX, panY: newPanY })
    },
    []
  )

  /**
   * Zoom + pan so that a given world-space rectangle fills the viewport.
   * Used for zoom-to-slide on double-click.
   */
  const zoomToRect = useCallback(
    (
      rectX: number,
      rectY: number,
      rectW: number,
      rectH: number,
      containerW: number,
      containerH: number
    ) => {
      const padding = 80
      const zoomX = (containerW - padding) / rectW
      const zoomY = (containerH - padding) / rectH
      const newZoom = clamp(Math.min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM)

      // Center the rect in the viewport
      const scaledRectW = rectW * newZoom
      const scaledRectH = rectH * newZoom
      const newPanX = (containerW - scaledRectW) / 2 - rectX * newZoom
      const newPanY = (containerH - scaledRectH) / 2 - rectY * newZoom

      setCamera({ zoom: newZoom, panX: newPanX, panY: newPanY })
    },
    []
  )

  // -------------------------------------------------------------------------
  // Wheel handler — zoom centered on cursor position
  // Uses proportional deltaY for smooth trackpad pinch and scroll wheel zoom.
  // Attached as a native event listener with { passive: false } so that
  // preventDefault() actually works and the browser doesn't zoom the page.
  // -------------------------------------------------------------------------

  useEffect(() => {
    const el = containerRef?.current
    if (!el) return

    function handleWheel(e: WheelEvent) {
      e.preventDefault()

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top

      // Normalize deltaY across browsers and input devices.
      // deltaMode 1 = line-based (multiply by ~16px line height).
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY

      setCamera((cam) => {
        // Proportional zoom: small deltas (trackpad pinch) = fine control,
        // large deltas (scroll wheel) = bigger steps. Matches Miro/Figma feel.
        const factor = Math.pow(2, -dy / 300)
        const newZoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM)
        const zoomRatio = newZoom / cam.zoom

        // Adjust pan so the point under the cursor stays fixed
        return {
          zoom: newZoom,
          panX: cursorX - zoomRatio * (cursorX - cam.panX),
          panY: cursorY - zoomRatio * (cursorY - cam.panY),
        }
      })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [containerRef])

  // -------------------------------------------------------------------------
  // Pointer drag handlers
  // -------------------------------------------------------------------------

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only pan on primary button (left click)
    if (e.button !== 0) return
    // Don't start pan if clicking on a child element that wants events
    if ((e.target as HTMLElement).closest('[data-no-pan]')) return
    dragging.current = true
    lastPointer.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPointer.current.x
    const dy = e.clientY - lastPointer.current.y
    lastPointer.current = { x: e.clientX, y: e.clientY }
    setCamera((cam) => ({ ...cam, panX: cam.panX + dx, panY: cam.panY + dy }))
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return {
    zoom: camera.zoom,
    panX: camera.panX,
    panY: camera.panY,
    zoomIn,
    zoomOut,
    fitToScreen,
    zoomToRect,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    isDragging: dragging,
  }
}
