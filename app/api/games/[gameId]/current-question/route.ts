import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// Returns the current question WITHOUT the correct_answer field.
// Used by player phones so the answer is never sent to the client.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params
  const { searchParams } = new URL(req.url)
  const index = parseInt(searchParams.get('index') ?? '0', 10)

  const admin = createAdminClient()

  const { data: question, error } = await admin
    .from('questions')
    .select('id, game_id, question_index, question_text, option_a, option_b, option_c, option_d')
    // Note: correct_answer is deliberately excluded
    .eq('game_id', gameId)
    .eq('question_index', index)
    .single()

  if (error || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  }

  return NextResponse.json({ question })
}
