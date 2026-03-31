import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params
  const supabase   = createAdminClient()

  // Random egg count 50–100, shown number 35–75
  const bonusEggCount    = Math.floor(Math.random() * 51) + 50   // 50–100
  const bonusShownNumber = Math.floor(Math.random() * 41) + 35   // 35–75

  const { error } = await supabase
    .from('games')
    .update({
      status:              'HIGHER_LOWER',
      bonus_egg_count:     bonusEggCount,
      bonus_shown_number:  bonusShownNumber,
    })
    .eq('id', gameId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bonusEggCount, bonusShownNumber })
}
