import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// The winner presses Higher or Lower — but they ALWAYS get it wrong.
// We just flip the game status to APRIL_FOOL regardless of their choice.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params
  const supabase   = createAdminClient()

  const { error } = await supabase
    .from('games')
    .update({ status: 'APRIL_FOOL' })
    .eq('id', gameId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ result: 'wrong' })
}
