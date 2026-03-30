import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase-server'
import type { ParsedQuestion } from '@/lib/types'

export async function POST(req: NextRequest) {
  // Verify the host is authenticated
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json()
  const questions: ParsedQuestion[] = body.questions

  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: 'No questions provided' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Create game record
  const { data: game, error: gameError } = await admin
    .from('games')
    .insert({ status: 'LOBBY' })
    .select()
    .single()

  if (gameError || !game) {
    console.error('Create game error:', gameError)
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 })
  }

  // Insert all questions
  const questionRows = questions.map(q => ({
    game_id:        game.id,
    question_index: q.question_index,
    question_text:  q.question_text,
    option_a:       q.option_a,
    option_b:       q.option_b,
    option_c:       q.option_c,
    option_d:       q.option_d,
    correct_answer: q.correct_answer,
  }))

  const { error: qError } = await admin.from('questions').insert(questionRows)
  if (qError) {
    console.error('Insert questions error:', qError)
    return NextResponse.json({ error: 'Failed to save questions' }, { status: 500 })
  }

  return NextResponse.json({ gameId: game.id })
}
