import { useCallback, useRef, useState } from 'react'

export type DragTarget =
  | { type: 'group'; id: string }
  | { type: 'slide'; id: string; groupId: string }

export interface DragState {
  target: DragTarget
  startCanvasX: number
  startCanvasY: number
  currentCanvasX: number
  currentCanvasY: number
  deltaX: number
  deltaY: number
}

interface UseCanvasDragOptions {
  zoom: number
  panX: number
  panY: number
  onDragEnd?: (drag: DragState) => void
}

/**
 * Hook for dragging items on a zoomed/panned canvas.
 *
 * Converts screen-space pointer deltas to canvas-space deltas
 * by dividing by the current zoom level.
 */
export function useCanvasDrag({ zoom, panX, panY, onDragEnd }: UseCanvasDragOptions) {
  const [activeDrag, setActiveDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const zoomRef = useRef(zoom)
  const panRef = useRef({ x: panX, y: panY })

  // Keep refs in sync
  zoomRef.current = zoom
  panRef.current = { x: panX, y: panY }

  /**
   * Convert a screen-space pointer position to canvas-space coordinates.
   */
  const screenToCanvas = useCallback((screenX: number, screenY: number, containerRect: DOMRect) => {
    const relX = screenX - containerRect.left
    const relY = screenY - containerRect.top
    const canvasX = (relX - panRef.current.x) / zoomRef.current
    const canvasY = (relY - panRef.current.y) / zoomRef.current
    return { canvasX, canvasY }
  }, [])

  const startDrag = useCallback(
    (e: React.PointerEvent, target: DragTarget, containerRect: DOMRect) => {
      e.stopPropagation()
      e.preventDefault()

      const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY, containerRect)

      const drag: DragState = {
        target,
        startCanvasX: canvasX,
        startCanvasY: canvasY,
        currentCanvasX: canvasX,
        currentCanvasY: canvasY,
        deltaX: 0,
        deltaY: 0,
      }

      dragRef.current = drag
      setActiveDrag(drag)

      // Capture pointer on the element
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [screenToCanvas]
  )

  const updateDrag = useCallback(
    (e: React.PointerEvent, containerRect: DOMRect) => {
      if (!dragRef.current) return

      const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY, containerRect)

      const drag: DragState = {
        ...dragRef.current,
        currentCanvasX: canvasX,
        currentCanvasY: canvasY,
        deltaX: canvasX - dragRef.current.startCanvasX,
        deltaY: canvasY - dragRef.current.startCanvasY,
      }

      dragRef.current = drag
      setActiveDrag(drag)
    },
    [screenToCanvas]
  )

  const endDrag = useCallback(() => {
    if (!dragRef.current) return

    const finalDrag = dragRef.current
    // Only fire onDragEnd if there was meaningful movement (> 3px threshold)
    const distance = Math.sqrt(finalDrag.deltaX ** 2 + finalDrag.deltaY ** 2)
    if (distance > 3) {
      onDragEnd?.(finalDrag)
    }

    dragRef.current = null
    setActiveDrag(null)
  }, [onDragEnd])

  const cancelDrag = useCallback(() => {
    dragRef.current = null
    setActiveDrag(null)
  }, [])

  return {
    activeDrag,
    isDragging: activeDrag !== null,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
    screenToCanvas,
  }
}
