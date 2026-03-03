'use client'

// ---------------------------------------------------------------------------
// LegalSection — renders a heading + multi-paragraph body with placeholder
// markers highlighted in yellow.
// ---------------------------------------------------------------------------

interface LegalSectionProps {
  heading: string
  body: string
}

const PLACEHOLDER_RE = /\[([A-ZÄÖÜ][A-ZÄÖÜ0-9 /\-_]*)\]/g

export function LegalSection({ heading, body }: LegalSectionProps) {
  // Split body by newlines, render paragraphs. Within each paragraph,
  // highlight [PLACEHOLDER] markers in yellow.
  const paragraphs = body.split('\n').filter((line) => line.trim().length > 0)

  function renderLine(text: string, idx: number) {
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    // Reset regex state for each line
    PLACEHOLDER_RE.lastIndex = 0
    while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      parts.push(
        <mark key={`${idx}-${match.index}`} className="rounded bg-yellow-200 px-0.5 text-yellow-900">
          {match[0]}
        </mark>,
      )
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    return parts
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
      {paragraphs.map((p, i) => {
        // Bullet points start with "•"
        if (p.trimStart().startsWith('•')) {
          return (
            <p key={i} className="pl-4 text-sm leading-relaxed text-gray-600">
              {renderLine(p, i)}
            </p>
          )
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-gray-600">
            {renderLine(p, i)}
          </p>
        )
      })}
    </section>
  )
}
