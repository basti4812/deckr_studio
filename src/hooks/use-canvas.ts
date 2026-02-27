import { useCallback, useRef, useState } from 'react'

const MIN_ZOOM = 0.08
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.15

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export interface CanvasState {
  zoom: number
  panX: number
  panY: number
}

export function useCanvas(initialZoom = 0.5) {
  const [zoom, setZoom] = useState(initialZoom)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)

  // Drag state stored in a ref to avoid stale closure issues in event handlers
  const dragging = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  // -------------------------------------------------------------------------
  // Zoom helpers
  // -------------------------------------------------------------------------

  const zoomIn = useCallback(() => {
    setZoom((z) => clamp(z * (1 + ZOOM_STEP), MIN_ZOOM, MAX_ZOOM))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((z) => clamp(z * (1 - ZOOM_STEP), MIN_ZOOM, MAX_ZOOM))
  }, [])

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

      setZoom(newZoom)
      setPanX(newPanX)
      setPanY(newPanY)
    },
    []
  )

  // -------------------------------------------------------------------------
  // Wheel handler — zoom centered on cursor position
  // -------------------------------------------------------------------------

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault()

      // Capture synchronously — e.currentTarget is nullified after the handler returns
      const rect = e.currentTarget.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      const delta = e.deltaY > 0 ? -1 : 1

      setZoom((currentZoom) => {
        const factor = 1 + delta * 0.1
        const newZoom = clamp(currentZoom * factor, MIN_ZOOM, MAX_ZOOM)
        const zoomRatio = newZoom / currentZoom

        // Adjust pan so the point under the cursor stays fixed
        setPanX((px) => cursorX - zoomRatio * (cursorX - px))
        setPanY((py) => cursorY - zoomRatio * (cursorY - py))

        return newZoom
      })
    },
    []
  )

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
    setPanX((px) => px + dx)
    setPanY((py) => py + dy)
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return {
    zoom,
    panX,
    panY,
    zoomIn,
    zoomOut,
    fitToScreen,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    isDragging: dragging,
  }
}
