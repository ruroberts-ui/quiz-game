'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Game, Player, QuestionForPlayer } from '@/lib/types'
import { playCorrect, playWrong, playWinner, playCountdownTick, playCountdownPanic } from '@/lib/sounds'

type PhoneState =
  | 'loading'
  | 'lobby'
  | 'question'
  | 'answered-correct'
  | 'answered-wrong'
  | 'eliminated'
  | 'winner'
  | 'game-over'

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const
const OPTION_KEYS   = ['option_a', 'option_b', 'option_c', 'option_d'] as const
const OPTION_COLORS = [
  'border-blue-400   bg-blue-900/50   hover:bg-blue-800',
  'border-orange-400 bg-orange-900/50 hover:bg-orange-800',
  'border-purple-400 bg-purple-900/50 hover:bg-purple-800',
  'border-teal-400   bg-teal-900/50   hover:bg-teal-800',
]

export default function PlayerScreen() {
  const { gameId, playerId } = useParams<{ gameId: string; playerId: string }>()
  const supabase = createClient()

  const [phoneState, setPhoneState] = useState<PhoneState>('loading')
  const [game, setGame]             = useState<Game | null>(null)
  const [player, setPlayer]         = useState<Player | null>(null)
  const [question, setQuestion]     = useState<QuestionForPlayer | null>(null)
  const [timeLeft, setTimeLeft]     = useState(10)
  const [winnerName, setWinnerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [chosenAnswer, setChosenAnswer] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load current question from API (strips correct_answer) ───
  async function loadQuestion(questionIndex: number) {
    const res = await fetch(`/api/games/${gameId}/current-question?index=${questionIndex}`)
    if (!res.ok) return
    const data = await res.json()
    setQuestion(data.question)
    setChosenAnswer(null)
  }

  // ── Initial load ─────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [{ data: g }, { data: p }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        supabase.from('players').select('*').eq('id', playerId).single(),
      ])
      if (!g || !p) { setPhoneState('game-over'); return }
      setGame(g)
      setPlayer(p)

      if (p.is_eliminated) { setPhoneState('eliminated'); return }

      if (g.status === 'LOBBY') {
        setPhoneState('lobby')
      } else if (g.status === 'IN_PROGRESS' || g.status === 'FINAL_QUESTION') {
        await loadQuestion(g.current_question_index)
        setPhoneState('question')
      } else if (g.status === 'COMPLETE') {
        if (g.winner_player_id === playerId) {
          setPhoneState('winner')
        } else {
          // Fetch winner name
          if (g.winner_player_id) {
            const { data: w } = await supabase.from('players').select('name').eq('id', g.winner_player_id).single()
            if (w) setWinnerName(w.name)
          }
          setPhoneState('game-over')
        }
      }
    }
    init()
  }, [gameId, playerId])

  // ── Realtime: game updates ───────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel(`play-game-${gameId}-${playerId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        async (payload) => {
          const updated = payload.new as Game
          const prev = game
          setGame(updated)

          if (updated.status === 'COMPLETE') {
            if (timerRef.current) clearInterval(timerRef.current)
            if (updated.winner_player_id === playerId) {
              playWinner()
              setPhoneState('winner')
            } else {
              if (updated.winner_player_id) {
                const { data: w } = await supabase.from('players').select('name').eq('id', updated.winner_player_id).single()
                if (w) setWinnerName(w.name)
              }
              setPhoneState('game-over')
            }
            return
          }

          if (updated.status === 'LOBBY') {
            setPhoneState('lobby')
            return
          }

          // New question started
          if ((updated.status === 'IN_PROGRESS' || updated.status === 'FINAL_QUESTION') &&
              updated.question_started_at &&
              updated.question_started_at !== prev?.question_started_at) {
            await loadQuestion(updated.current_question_index)
            setPhoneState('question')
          }
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${playerId}` },
        (payload) => {
          const updated = payload.new as Player
          setPlayer(updated)
          if (updated.is_eliminated && phoneState !== 'eliminated') {
            if (timerRef.current) clearInterval(timerRef.current)
            setPhoneState('eliminated')
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId, playerId, game, phoneState])

  // ── Countdown timer (synced to question_started_at) ──────────
  useEffect(() => {
    if (!game?.question_started_at) return
    if (game.status !== 'IN_PROGRESS' && game.status !== 'FINAL_QUESTION') return
    if (phoneState !== 'question') return

    const startTime = new Date(game.question_started_at).getTime()
    const DURATION  = 10

    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      const elapsed   = (Date.now() - startTime) / 1000
      const remaining = Math.max(0, DURATION - elapsed)
      setTimeLeft(remaining)

      if (remaining <= 3 && remaining > 0) playCountdownPanic()
      else if (remaining > 3 && Math.abs(remaining - Math.round(remaining)) < 0.15) playCountdownTick()

      if (remaining <= 0) {
        clearInterval(timerRef.current!)
      }
    }, 100)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [game?.question_started_at, game?.status, phoneState])

  // ── Submit answer ────────────────────────────────────────────
  async function handleAnswer(letter: string) {
    if (submitting || chosenAnswer || !question) return
    setChosenAnswer(letter)
    setSubmitting(true)
    if (timerRef.current) clearInterval(timerRef.current)

    const res  = await fetch('/api/answers/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, questionId: question.id, answerGiven: letter }),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) return

    if (data.isWinner) {
      playWinner()
      setPhoneState('winner')
    } else if (data.isCorrect) {
      playCorrect()
      setPhoneState('answered-correct')
    } else {
      playWrong()
      setPhoneState('answered-wrong')
    }
  }

  const timerDisplay = Math.ceil(timeLeft)
  const isDanger     = timeLeft <= 3 && timeLeft > 0

  // ── Render ───────────────────────────────────────────────────

  if (phoneState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cobalt-900">
        <p className="font-display text-2xl text-gold-400 tracking-widest animate-pulse">LOADING…</p>
      </div>
    )
  }

  if (phoneState === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6 text-center">
        <div className="text-6xl mb-6">🎯</div>
        <h2 className="font-display text-4xl text-gold-400 tracking-widest uppercase mb-4">
          You're In!
        </h2>
        <p className="text-white font-display text-2xl uppercase tracking-wide mb-2">
          {player?.name}
        </p>
        <p className="text-white/40 text-sm mt-6">
          Waiting for the host to start the game…
        </p>
        <div className="mt-8 flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-gold-400 animate-bounce"
                 style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    )
  }

  if (phoneState === 'eliminated' || phoneState === 'answered-wrong') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-red-950 px-6 text-center">
        <div className="text-8xl mb-6 animate-bounce">💥</div>
        <h2 className="font-display text-5xl text-red-400 tracking-widest uppercase mb-4">
          Eliminated!
        </h2>
        <p className="text-white/60 text-lg">
          Better luck next time, {player?.name}
        </p>
      </div>
    )
  }

  if (phoneState === 'answered-correct') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-green-950 px-6 text-center">
        <div className="text-8xl mb-6">✅</div>
        <h2 className="font-display text-5xl text-green-400 tracking-widest uppercase mb-4">
          Correct!
        </h2>
        <p className="text-white/60 text-lg">Get ready for the next question…</p>
        <div className="mt-8 flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-green-400 animate-bounce"
                 style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    )
  }

  if (phoneState === 'winner') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6 text-center">
        <div className="text-8xl mb-6 animate-winnerBurst">🏆</div>
        <h2 className="font-display text-3xl text-gold-400 tracking-widest uppercase mb-2">
          YOU WON!
        </h2>
        <p className="font-display text-6xl gold-shimmer tracking-widest uppercase">
          {player?.name}
        </p>
        <p className="text-white/40 mt-6 text-sm">Last player standing!</p>
      </div>
    )
  }

  if (phoneState === 'game-over') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6 text-center">
        <div className="text-6xl mb-6">🎮</div>
        <h2 className="font-display text-4xl text-white/60 tracking-widest uppercase mb-4">
          Game Over
        </h2>
        {winnerName ? (
          <p className="text-white/60">
            Winner: <span className="text-gold-400 font-display text-xl">{winnerName}</span>
          </p>
        ) : (
          <p className="text-white/40">No survivors this time!</p>
        )}
      </div>
    )
  }

  // ── Question screen ──────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-cobalt-900">
      {/* Timer bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-cobalt-950 border-b-2 border-cobalt-700">
        <span className="font-display text-sm text-white/40 tracking-widest uppercase">
          {game?.status === 'FINAL_QUESTION' ? '⚡ FINAL' : `Q${(game?.current_question_index ?? 0) + 1}`}
        </span>
        <div className={`font-display text-4xl leading-none w-14 h-14 rounded-full border-4 flex items-center justify-center
                         ${isDanger ? 'border-red-500 text-red-400 timer-danger' : 'border-gold-400 text-gold-400'}`}>
          {timerDisplay > 0 ? timerDisplay : '–'}
        </div>
        <span className="font-display text-sm text-white/40 tracking-widest uppercase">
          {player?.name}
        </span>
      </div>

      {/* Question text */}
      <div className="px-5 py-6 flex-shrink-0">
        {game?.status === 'FINAL_QUESTION' && (
          <p className="text-gold-400 font-display text-xs tracking-widest text-center mb-3 uppercase">
            ⚡ First correct answer wins ⚡
          </p>
        )}
        <p className="font-display text-xl md:text-2xl text-white tracking-wide leading-snug text-center animate-questionReveal">
          {question?.question_text}
        </p>
      </div>

      {/* Answer buttons */}
      <div className="flex-1 grid grid-cols-2 gap-3 px-4 pb-6">
        {OPTION_LABELS.map((letter, i) => {
          const optKey  = OPTION_KEYS[i]
          const color   = OPTION_COLORS[i]
          const isChosen = chosenAnswer === letter

          return (
            <button
              key={letter}
              onClick={() => handleAnswer(letter)}
              disabled={!!chosenAnswer || submitting || timeLeft <= 0}
              className={`flex flex-col items-start justify-between rounded-2xl border-4 p-4
                          font-display text-lg tracking-wide text-left
                          active:scale-95 transition-all duration-100 disabled:cursor-not-allowed
                          ${isChosen ? 'opacity-80 scale-95' : ''}
                          ${chosenAnswer && !isChosen ? 'opacity-30' : ''}
                          ${!chosenAnswer ? color : ''}
                          ${isChosen ? 'border-white bg-white/20 text-white' : 'text-white'}`}
            >
              <span className="text-3xl font-bold text-gold-400 mb-2">{letter}</span>
              <span className="text-base leading-snug">{question?.[optKey] ?? ''}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
