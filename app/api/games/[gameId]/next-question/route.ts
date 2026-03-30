import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()

  const { data: game } = await admin.from('games').select('*').eq('id', gameId).single()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status === 'COMPLETE') return NextResponse.json({ ok: true })

  // Count total questions
  const { count } = await admin
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId)
  const total = count ?? 0

  // Count surviving players
  const { count: survivorCount } = await admin
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('is_eliminated', false)

  const survivors = survivorCount ?? 0

  // Safety checks — process-round should have already handled these
  if (survivors === 0) {
    await admin.from('games').update({ status: 'COMPLETE', winner_player_id: null }).eq('id', gameId)
    return NextResponse.json({ ok: true, status: 'COMPLETE' })
  }

  const nextIndex = game.current_question_index + 1

  if (nextIndex >= total || survivors === 1) {
    // Determine winner if only one survivor
    let winnerId: string | null = null
    if (survivors === 1) {
      const { data: last } = await admin
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('is_eliminated', false)
        .single()
      winnerId = last?.id ?? null
    }
    await admin.from('games').update({ status: 'COMPLETE', winner_player_id: winnerId }).eq('id', gameId)
    return NextResponse.json({ ok: true, status: 'COMPLETE' })
  }

  // Advance to next question
  const isLast   = nextIndex === total - 1
  const newStatus = isLast ? 'FINAL_QUESTION' : 'IN_PROGRESS'

  await admin.from('games').update({
    status:                 newStatus,
    current_question_index: nextIndex,
    question_started_at:    new Date().toISOString(),
  }).eq('id', gameId)

  return NextResponse.json({ ok: true, status: newStatus, nextIndex })
}
