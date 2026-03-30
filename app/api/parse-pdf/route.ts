import { NextRequest, NextResponse } from 'next/server'
import type { ParsedQuestion } from '@/lib/types'

// Parse the raw text extracted from the PDF into structured questions.
function parseQuestions(text: string): ParsedQuestion[] {
  // Normalise line endings and condense whitespace
  const normalised = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const questions: ParsedQuestion[] = []

  // Split on question markers: Q1. Q2. etc.
  const blocks = normalised.split(/\n(?=Q\d+\.)/i)

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) continue

    // First line: "Q1. Question text here"
    const qMatch = lines[0].match(/^Q(\d+)\.\s*(.+)$/i)
    if (!qMatch) continue
    const questionIndex = parseInt(qMatch[1], 10) - 1
    const question_text = qMatch[2].trim()

    let option_a = '', option_b = '', option_c = '', option_d = ''
    let correct_answer = ''

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const optA = line.match(/^A[)\.]?\s*(.+)$/i)
      const optB = line.match(/^B[)\.]?\s*(.+)$/i)
      const optC = line.match(/^C[)\.]?\s*(.+)$/i)
      const optD = line.match(/^D[)\.]?\s*(.+)$/i)
      const ans  = line.match(/^Answer\s*[:\-]\s*([ABCD])/i)

      if (optA) option_a = optA[1].trim()
      if (optB) option_b = optB[1].trim()
      if (optC) option_c = optC[1].trim()
      if (optD) option_d = optD[1].trim()
      if (ans)  correct_answer = ans[1].toUpperCase()
    }

    // option_d is optional — questions can have 3 or 4 choices
    if (!option_a || !option_b || !option_c || !correct_answer) continue

    questions.push({ question_index: questionIndex, question_text, option_a, option_b, option_c, option_d, correct_answer })
  }

  // Sort by question index and cap at 10
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
