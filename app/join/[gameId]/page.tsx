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

    // Store player ID so the play screen can identify us
    localStorage.setItem(`quiz-player-${gameId}`, data.playerId)
    router.push(`/play/${gameId}/${data.playerId}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6">
      <h1 className="font-display text-5xl text-gold-400 tracking-widest uppercase mb-2 animate-glow">
        QUIZ MASTER
      </h1>
      <p className="text-white/40 text-sm tracking-widest mb-12 uppercase">
        Enter the arena
      </p>

      <form onSubmit={handleJoin} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm text-white/60 mb-2 uppercase tracking-wider">
            Your name
          </label>
          <input
            type="text"
            required
            maxLength={20}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            autoComplete="off"
            className="w-full bg-cobalt-800 border-4 border-cobalt-600 focus:border-gold-400
                       rounded-xl px-5 py-4 text-white font-display text-2xl tracking-wide
                       outline-none transition-colors text-center uppercase placeholder:normal-case
                       placeholder:font-body placeholder:text-base placeholder:tracking-normal"
            placeholder="e.g. Sarah"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={joining || !name.trim()}
          className="w-full bg-gold-500 hover:bg-gold-400 disabled:opacity-40
                     text-cobalt-950 font-display text-3xl tracking-widest
                     py-5 rounded-xl uppercase transition-colors"
        >
          {joining ? 'Joining…' : 'Join Game'}
        </button>
      </form>
    </div>
  )
}
