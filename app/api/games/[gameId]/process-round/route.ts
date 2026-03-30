import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params
  const admin = createAdminClient()

  // Load game
  const { data: game } = await admin.from('games').select('*').eq('id', gameId).single()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  // Don't process if already complete (winner declared by submit-answer)
  if (game.status === 'COMPLETE') {
    return NextResponse.json({ ok: true, alreadyComplete: true })
  }
  if (game.status !== 'IN_PROGRESS' && game.status !== 'FINAL_QUESTION') {
    return NextResponse.json({ error: 'Game not in progress' }, { status: 400 })
  }

  // Find current question
  const { data: currentQ } = await admin
    .from('questions')
    .select('id')
    .eq('game_id', gameId)
    .eq('question_index', game.current_question_index)
    .single()

  if (!currentQ) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  // Get all non-eliminated players
  const { data: activePlayers } = await admin
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('is_eliminated', false)

  if (!activePlayers || activePlayers.length === 0) {
    // Nobody left — declare game over with no winner
    await admin.from('games').update({ status: 'COMPLETE', winner_player_id: null }).eq('id', gameId)
    return NextResponse.json({ ok: true, survivors: 0 })
  }

  // Get correct answers for this question
  const { data: correctAnswers } = await admin
    .from('answers')
    .select('player_id')
    .eq('question_id', currentQ.id)
    .eq('is_correct', true)

  const correctPlayerIds = new Set((correctAnswers ?? []).map((a: { player_id: string }) => a.player_id))

  // Eliminate players who didn't answer correctly
  const toEliminate = activePlayers
    .filter((p: { id: string }) => !correctPlayerIds.has(p.id))
    .map((p: { id: string }) => p.id)

  if (toEliminate.length > 0) {
    await admin
      .from('players')
      .update({ is_eliminated: true })
      .in('id', toEliminate)
  }

  const survivors = activePlayers.length - toEliminate.length

  // Check end conditions
  if (survivors === 0) {
    await admin.from('games').update({ status: 'COMPLETE', winner_player_id: null }).eq('id', gameId)
  } else if (survivors === 1) {
    const winnerId = activePlayers.find((p: { id: string }) => correctPlayerIds.has(p.id))!.id
    await admin.from('games').update({ status: 'COMPLETE', winner_player_id: winnerId }).eq('id', gameId)
  }
  // If multiple survivors, host will call next-question to advance

  return NextResponse.json({ ok: true, survivors, eliminated: toEliminate.length })
}
