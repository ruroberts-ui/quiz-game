'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function JoinPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const router = useRouter()

  const [name, setName]       = useState('')
  const [error, setError]     = useState('')
  const [joining, setJoining] = useState(false)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setError('')
    setJoining(true)

    const res  = await fetch('/api/players/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, name: trimmed }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Could not join game')
      setJoining(false)
      return
    }

    localStorage.setItem(`quiz-player-${gameId}`, data.playerId)
    router.push(`/play/${gameId}/${data.playerId}`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-cobalt-900 px-6">

      {/* Top decoration strip */}
      <div className="text-center py-4 text-3xl tracking-widest opacity-60 select-none">
        🥚🐰🌷🐣🌸🐇🥚🐰🌷🐣
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center">

        {/* Bouncing egg */}
        <div className="text-8xl mb-4" style={{ animation: 'eggBounce 1.6s ease-in-out infinite' }}>
          🥚
        </div>

        <h1 className="font-display text-5xl text-gold-400 tracking-widest uppercase mb-1 text-center"
            style={{ animation: 'glow 3s ease-in-out infinite' }}>
          Easter Quiz
        </h1>
        <p className="text-white/50 text-sm tracking-widest uppercase mb-10">
          Join the hunt!
        </p>

        {/* Name entry — clearly NOT a login */}
        <form onSubmit={handleJoin} className="w-full max-w-sm space-y-4">

          <div className="bg-cobalt-800 border-2 border-cobalt-600 rounded-2xl p-6">
            <p className="text-white/70 text-sm text-center mb-4">
              🐣 No account needed — just pick a name!
            </p>

            <label className="block text-xs text-white/50 mb-2 uppercase tracking-widest text-center">
              Your player name
            </label>
            <input
              type="text"
              required
              maxLength={20}
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              autoComplete="off"
              className="w-full bg-cobalt-900 border-4 border-cobalt-600 focus:border-gold-400
                         rounded-xl px-5 py-4 text-white font-display text-3xl tracking-wide
                         outline-none transition-colors text-center uppercase"
              placeholder="e.g. SARAH"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-900/30 rounded-xl px-4 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={joining || !name.trim()}
            className="w-full bg-gold-400 hover:bg-gold-300 disabled:opacity-40
                       text-cobalt-950 font-display text-3xl tracking-widest
                       py-5 rounded-2xl uppercase transition-colors
                       flex items-center justify-center gap-3"
          >
            {joining ? '🐰 Joining…' : '🐰 Join the Hunt!'}
          </button>
        </form>
      </div>

      {/* Bottom decoration strip */}
      <div className="text-center py-4 text-3xl tracking-widest opacity-60 select-none">
        🌸🐇🥚🌷🐣🐰🌸🐇🥚🌷
      </div>
    </div>
  )
}
