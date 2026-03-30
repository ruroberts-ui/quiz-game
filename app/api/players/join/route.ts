import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { gameId, name } = body

  if (!gameId || !name?.trim()) {
    return NextResponse.json({ error: 'gameId and name are required' }, { status: 400 })
  }

  const trimmedName = name.trim().slice(0, 20)
  const admin = createAdminClient()

  // Check game exists and is still in LOBBY
  const { data: game } = await admin.from('games').select('status').eq('id', gameId).single()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'LOBBY') {
    return NextResponse.json({ error: 'This game has already started — you cannot join now' }, { status: 409 })
  }

  // Check for duplicate name in this game
  const { data: existing } = await admin
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .ilike('name', trimmedName)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'That name is already taken — choose a different one' }, { status: 409 })
  }

  const { data: player, error } = await admin
    .from('players')
    .insert({ game_id: gameId, name: trimmedName })
    .select()
    .single()

  if (error || !player) {
    console.error('Join error:', error)
    return NextResponse.json({ error: 'Failed to join game' }, { status: 500 })
  }

  return NextResponse.json({ playerId: player.id })
}
