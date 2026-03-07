'use client'

import { createContext, useCallback, useContext, useState } from 'react'

interface BoardFullscreenContextValue {
  isFullscreen: boolean
  toggleFullscreen: () => void
}

const BoardFullscreenContext = createContext<BoardFullscreenContextValue>({
  isFullscreen: false,
  toggleFullscreen: () => {},
})

export function BoardFullscreenProvider({ children }: { children: React.ReactNode }) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  return (
    <BoardFullscreenContext.Provider value={{ isFullscreen, toggleFullscreen }}>
      {children}
    </BoardFullscreenContext.Provider>
  )
}

export function useBoardFullscreen() {
  return useContext(BoardFullscreenContext)
}
