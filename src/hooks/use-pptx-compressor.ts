'use client'

import { useCallback, useRef, useState } from 'react'

export interface CompressionProgress {
  percent: number
  currentImage: string
}

export type CompressionResult =
  | {
      status: 'done'
      file: File
      originalSize: number
      compressedSize: number
      imagesProcessed: number
      imagesSkipped: number
    }
  | { status: 'no-images' }
  | { status: 'already-optimal'; file: File }
  | { status: 'error'; message: string }

export function usePptxCompressor() {
  const [compressing, setCompressing] = useState(false)
  const [progress, setProgress] = useState<CompressionProgress>({ percent: 0, currentImage: '' })
  const workerRef = useRef<Worker | null>(null)

  const compress = useCallback((file: File): Promise<CompressionResult> => {
    return new Promise((resolve) => {
      setCompressing(true)
      setProgress({ percent: 0, currentImage: '' })

      const worker = new Worker('/workers/pptx-compressor.js')
      workerRef.current = worker

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data

        if (data.type === 'progress') {
          setProgress({ percent: data.percent, currentImage: data.currentImage })
          return
        }

        // Terminal messages — clean up worker
        worker.terminate()
        workerRef.current = null
        setCompressing(false)

        if (data.type === 'done') {
          const compressedFile = new File([data.buffer], file.name, {
            type: file.type,
            lastModified: Date.now(),
          })
          resolve({
            status: 'done',
            file: compressedFile,
            originalSize: data.originalSize,
            compressedSize: data.compressedSize,
            imagesProcessed: data.imagesProcessed,
            imagesSkipped: data.imagesSkipped,
          })
        } else if (data.type === 'no-images') {
          resolve({ status: 'no-images' })
        } else if (data.type === 'already-optimal') {
          const originalFile = new File([data.buffer], file.name, {
            type: file.type,
            lastModified: Date.now(),
          })
          resolve({ status: 'already-optimal', file: originalFile })
        } else if (data.type === 'error') {
          resolve({ status: 'error', message: data.message })
        }
      }

      worker.onerror = (err) => {
        worker.terminate()
        workerRef.current = null
        setCompressing(false)
        resolve({ status: 'error', message: err.message || 'Worker error' })
      }

      // Send file as ArrayBuffer to the worker
      file.arrayBuffer().then((buffer) => {
        worker.postMessage({ type: 'compress', buffer }, [buffer])
      })
    })
  }, [])

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
      setCompressing(false)
      setProgress({ percent: 0, currentImage: '' })
    }
  }, [])

  return { compress, cancel, compressing, progress }
}
