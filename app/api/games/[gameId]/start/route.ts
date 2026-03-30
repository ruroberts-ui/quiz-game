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

  // Check game exists and is in LOBBY state
  const { data: game } = await admin.from('games').select('*').eq('id', gameId).single()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'LOBBY') return NextResponse.json({ error: 'Game already started' }, { status: 400 })

  // Count questions to determine if first question is also the final
  const { count } = await admin.from('questions').select('*', { count: 'exact', head: true }).eq('game_id', gameId)
  const totalQuestions = count ?? 0

  const newStatus = totalQuestions === 1 ? 'FINAL_QUESTION' : 'IN_PROGRESS'

  const { error } = await admin.from('games').update({
    status:                newStatus,
    current_question_index: 0,
    question_started_at:   new Date().toISOString(),
  }).eq('id', gameId)

  if (error) return NextResponse.json({ error: 'Failed to start game' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
