import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { playerId, questionId, answerGiven } = body

  if (!playerId || !questionId || !answerGiven) {
    return NextResponse.json({ error: 'playerId, questionId, and answerGiven are required' }, { status: 400 })
  }

  const answer = String(answerGiven).toUpperCase()
  if (!['A', 'B', 'C', 'D'].includes(answer)) {
    return NextResponse.json({ error: 'answerGiven must be A, B, C, or D' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify player is not eliminated
  const { data: player } = await admin.from('players').select('*').eq('id', playerId).single()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (player.is_eliminated) return NextResponse.json({ error: 'Player is eliminated' }, { status: 409 })

  // Fetch the correct answer for this question + the game state
  const { data: question } = await admin
    .from('questions')
    .select('correct_answer, game_id')
    .eq('id', questionId)
    .single()
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const { data: game } = await admin
    .from('games')
    .select('status, current_question_index')
    .eq('id', question.game_id)
    .single()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  // Only accept answers while the game is running
  if (game.status !== 'IN_PROGRESS' && game.status !== 'FINAL_QUESTION') {
    return NextResponse.json({ error: 'Game is not accepting answers right now' }, { status: 409 })
  }

  const isCorrect = answer === question.correct_answer

  // Record the answer (UNIQUE constraint prevents double-submission)
  const { error: insertError } = await admin.from('answers').insert({
    player_id:    playerId,
    question_id:  questionId,
    answer_given: answer,
    is_correct:   isCorrect,
  })

  if (insertError) {
    // Unique violation = already answered
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'Already answered' }, { status: 409 })
    }
    console.error('Answer insert error:', insertError)
    return NextResponse.json({ error: 'Failed to record answer' }, { status: 500 })
  }

  let isWinner = false

  // FINAL_QUESTION: first correct answer wins the whole game
  if (game.status === 'FINAL_QUESTION' && isCorrect) {
    // Only update to COMPLETE if not already done (race condition guard)
    const { data: currentGame } = await admin
      .from('games')
      .select('status')
      .eq('id', question.game_id)
      .single()

    if (currentGame?.status === 'FINAL_QUESTION') {
      await admin.from('games').update({
        status:          'COMPLETE',
        winner_player_id: playerId,
      }).eq('id', question.game_id)
      isWinner = true
    }
  }

  return NextResponse.json({ isCorrect, isWinner })
}
