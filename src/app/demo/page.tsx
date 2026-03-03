import type { Metadata } from 'next'
import { DemoBanner } from '@/components/demo/demo-banner'
import { DemoBoard } from '@/components/demo/demo-board'

export const metadata: Metadata = {
  title: 'deckr Demo -- Try the Presentation Platform',
  description:
    'Experience how deckr works with a live interactive demo. Browse slides, build a presentation, and see the export flow -- no sign-up required.',
}

export default function DemoPage() {
  return (
    <div className="flex h-screen flex-col">
      <DemoBanner />
      <DemoBoard />
    </div>
  )
}
