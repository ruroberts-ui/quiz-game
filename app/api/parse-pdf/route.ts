import { NextRequest, NextResponse } from 'next/server'
import type { ParsedQuestion } from '@/lib/types'

// Parse the raw text extracted from the PDF into structured questions.
// Handles: 3 or 4 options, options that wrap across multiple lines, answers on a new page.
function parseQuestions(text: string): ParsedQuestion[] {
  const normalised = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const questions: ParsedQuestion[] = []
  const blocks = normalised.split(/\n(?=Q\d+\.)/i)

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) continue

    // First line must be the question: "Q1. Question text"
    const qMatch = lines[0].match(/^Q(\d+)\.\s*(.+)$/i)
    if (!qMatch) continue

    const questionIndex = parseInt(qMatch[1], 10) - 1
    const question_text = qMatch[2].trim()

    // Walk through the remaining lines.
    // A new section starts when a line begins with A) B) C) D) or Answer:
    // Any other line is a continuation of the previous section (handles line wrapping).
    type SectionKey = 'a' | 'b' | 'c' | 'd' | 'answer'
    let currentKey: SectionKey | null = null
    let currentLines: string[] = []

    let option_a = '', option_b = '', option_c = '', option_d = '', correct_answer = ''

    const flush = () => {
      if (!currentKey) return
      const content = currentLines.join(' ').trim()
      if (currentKey === 'a')      option_a = content
      else if (currentKey === 'b') option_b = content
      else if (currentKey === 'c') option_c = content
      else if (currentKey === 'd') option_d = content
      else if (currentKey === 'answer') correct_answer = content
      currentLines = []
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]

      // Matches "A) text", "B) text" etc. — requires closing paren so "And" won't match
      const optMatch = line.match(/^([ABCD])\)\s*(.*)/i)
      // Matches "Answer: B" or "Answer - B"
      const ansMatch = line.match(/^Answer\s*[:\-]\s*([ABCD])/i)

      if (optMatch) {
        flush()
        currentKey = optMatch[1].toLowerCase() as SectionKey
        currentLines = [optMatch[2]]
      } else if (ansMatch) {
        flush()
        currentKey = 'answer'
        currentLines = [ansMatch[1].toUpperCase()]
      } else {
        // Continuation of the previous option (e.g. a wrapped line)
        if (currentKey && currentKey !== 'answer') {
          currentLines.push(line)
        }
      }
    }
    flush() // save the last section

    // option_d is optional — 3-option questions are fine
    if (!option_a || !option_b || !option_c || !correct_answer) continue

    questions.push({ question_index: questionIndex, question_text, option_a, option_b, option_c, option_d, correct_answer })
  }

  return questions
    .sort((a, b) => a.question_index - b.question_index)
    .slice(0, 10)
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    // Dynamic import avoids issues with pdf-parse's test-file side-effect at module load time
    const pdf = (await import('pdf-parse')).default
    const parsed = await pdf(buffer)

    const questions = parseQuestions(parsed.text)

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'No questions found in the PDF. Make sure you\'re using the correct format (Q1. Q2. … with A) B) C) D) options and Answer: X).' },
        { status: 422 }
      )
    }

    return NextResponse.json({ questions })
  } catch (err) {
    console.error('PDF parse error:', err)
    return NextResponse.json({ error: 'Failed to read PDF. Try re-saving it from Word or Google Docs.' }, { status: 500 })
  }
}
