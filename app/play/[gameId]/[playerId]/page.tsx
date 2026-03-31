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
  | 'higher-lower'
  | 'april-fool'
  | 'game-over'

// Three phases of the hatching egg elimination animation
type ElimPhase = 'shaking' | 'hatching' | 'revealed'

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const
const OPTION_KEYS   = ['option_a', 'option_b', 'option_c', 'option_d'] as const
const OPTION_COLORS = [
  'border-easter-pink   bg-pink-900/40   hover:bg-pink-800/60',
  'border-easter-green  bg-green-900/40  hover:bg-green-800/60',
  'border-easter-blue   bg-blue-900/40   hover:bg-blue-800/60',
  'border-easter-lavender bg-purple-900/40 hover:bg-purple-800/60',
]

export default function PlayerScreen() {
  const { gameId, playerId } = useParams<{ gameId: string; playerId: string }>()
  const supabase = createClient()

  const [phoneState, setPhoneState]     = useState<PhoneState>('loading')
  const [game, setGame]                 = useState<Game | null>(null)
  const [player, setPlayer]             = useState<Player | null>(null)
  const [question, setQuestion]         = useState<QuestionForPlayer | null>(null)
  const [timeLeft, setTimeLeft]         = useState(15)
  const [winnerName, setWinnerName]     = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [chosenAnswer, setChosenAnswer] = useState<string | null>(null)
  const [bonusSubmitting, setBonusSubmitting] = useState(false)

  // Elimination animation phase
  const [elimPhase, setElimPhase] = useState<ElimPhase>('shaking')

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const elimTimers  = useRef<ReturnType<typeof setTimeout>[]>([])

  async function loadQuestion(questionIndex: number) {
    const res = await fetch(`/api/games/${gameId}/current-question?index=${questionIndex}`)
    if (!res.ok) return
    const data = await res.json()
    setQuestion(data.question)
    setChosenAnswer(null)
  }

  // Drive the 3-phase egg-hatching animation whenever we enter an elimination state
  useEffect(() => {
    if (phoneState !== 'eliminated' && phoneState !== 'answered-wrong') return

    // Clear any lingering timers
    elimTimers.current.forEach(clearTimeout)
    setElimPhase('shaking')

    const t1 = setTimeout(() => setElimPhase('hatching'),  1100)
    const t2 = setTimeout(() => setElimPhase('revealed'),  2400)
    elimTimers.current = [t1, t2]

    return () => { t1 && clearTimeout(t1); t2 && clearTimeout(t2) }
  }, [phoneState])

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
      } else if (g.status === 'HIGHER_LOWER') {
        if (g.winner_player_id === playerId) setPhoneState('higher-lower')
        else setPhoneState('game-over')
      } else if (g.status === 'APRIL_FOOL') {
        if (g.winner_player_id === playerId) setPhoneState('april-fool')
        else setPhoneState('game-over')
      } else if (g.status === 'COMPLETE') {
        if (g.winner_player_id === playerId) {
          setPhoneState('winner')
        } else {
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

          if (updated.status === 'HIGHER_LOWER') {
            if (timerRef.current) clearInterval(timerRef.current)
            if (updated.winner_player_id === playerId) setPhoneState('higher-lower')
            return
          }

          if (updated.status === 'APRIL_FOOL') {
            if (updated.winner_player_id === playerId) setPhoneState('april-fool')
            return
          }

          if (updated.status === 'LOBBY') { setPhoneState('lobby'); return }

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

  useEffect(() => {
    if (!game?.question_started_at) return
    if (game.status !== 'IN_PROGRESS' && game.status !== 'FINAL_QUESTION') return
    if (phoneState !== 'question') return

    const startTime = new Date(game.question_started_at).getTime()
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      const elapsed   = (Date.now() - startTime) / 1000
      const remaining = Math.max(0, 15 - elapsed)
      setTimeLeft(remaining)
      if (remaining <= 3 && remaining > 0) playCountdownPanic()
      else if (remaining > 3 && Math.abs(remaining - Math.round(remaining)) < 0.15) playCountdownTick()
      if (remaining <= 0) clearInterval(timerRef.current!)
    }, 100)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [game?.question_started_at, game?.status, phoneState])

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

  async function handleBonusAnswer(choice: 'higher' | 'lower') {
    if (bonusSubmitting) return
    setBonusSubmitting(true)
    await fetch(`/api/games/${gameId}/bonus-answer`, { method: 'POST' })
    // State will update via Realtime when status becomes APRIL_FOOL
  }

  const timerDisplay = Math.ceil(timeLeft)
  const isDanger     = timeLeft <= 3 && timeLeft > 0

  // ── Loading ──────────────────────────────────────────────────
  if (phoneState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cobalt-900">
        <div className="text-center">
          <div className="text-6xl mb-4" style={{ animation: 'eggBounce 1.2s ease-in-out infinite' }}>🥚</div>
          <p className="font-display text-xl text-gold-400 tracking-widest animate-pulse">LOADING…</p>
        </div>
      </div>
    )
  }

  // ── Lobby ────────────────────────────────────────────────────
  if (phoneState === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col bg-cobalt-900">
        <div className="text-center py-3 text-2xl tracking-widest opacity-40 select-none">
          🥚🐰🌷🐣🌸🐇🥚🐰🌷🐣
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-8xl mb-6" style={{ animation: 'eggBounce 1.8s ease-in-out infinite' }}>🐰</div>
          <h2 className="font-display text-4xl text-gold-400 tracking-widest uppercase mb-3">
            You&rsquo;re in!
          </h2>
          <p className="font-display text-3xl text-white uppercase tracking-wide mb-6">
            {player?.name}
          </p>
          <p className="text-white/40 text-sm">
            Waiting in the warren… the host will start soon
          </p>
          <div className="mt-8 flex gap-2">
            {['🥚','🥚','🥚'].map((e, i) => (
              <span key={i} className="text-2xl" style={{ animation: `eggBounce 1s ease-in-out infinite`, animationDelay: `${i * 0.25}s` }}>{e}</span>
            ))}
          </div>
        </div>
        <div className="text-center py-3 text-2xl tracking-widest opacity-40 select-none">
          🌸🐇🥚🌷🐣🐰🌸🐇🥚🌷
        </div>
      </div>
    )
  }

  // ── Eliminated / Wrong Answer → hatching egg → Mr T ──────────
  if (phoneState === 'eliminated' || phoneState === 'answered-wrong') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6 text-center">

        {elimPhase === 'shaking' && (
          <>
            <div
              className="text-9xl mb-6"
              style={{ animation: 'eggShake 0.35s ease-in-out infinite' }}
            >
              🥚
            </div>
            <p className="font-display text-2xl text-gold-400 tracking-widest uppercase animate-pulse">
              Uh oh…
            </p>
          </>
        )}

        {elimPhase === 'hatching' && (
          <>
            <div
              className="text-9xl mb-6"
              style={{ animation: 'eggCrack 1.2s ease-in forwards' }}
            >
              🐣
            </div>
            <p className="font-display text-2xl text-gold-400 tracking-widest uppercase animate-pulse">
              Something&apos;s hatching…
            </p>
          </>
        )}

        {elimPhase === 'revealed' && (
          <>
            <img
              src="/MrT.jpg"
              alt="Mr T"
              className="w-64 h-auto rounded-2xl mb-5 border-4 border-red-500"
              style={{ animation: 'mrTReveal 0.7s cubic-bezier(0.175,0.885,0.32,1.275) forwards' }}
            />
            <h2
              className="font-display text-4xl text-red-400 tracking-widest uppercase mb-3"
              style={{ animation: 'mrTReveal 0.7s 0.1s ease-out both' }}
            >
              You&apos;re an April Fool!
            </h2>
            <p className="text-white/50 text-lg">
              Hard luck, {player?.name}! 🥚
            </p>
            <p className="text-white/25 text-sm mt-2">Better luck next Easter…</p>
          </>
        )}
      </div>
    )
  }

  // ── Answered correct, waiting ────────────────────────────────
  if (phoneState === 'answered-correct') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6 text-center">
        <div className="text-8xl mb-6">🐣</div>
        <h2 className="font-display text-5xl text-easter-green tracking-widest uppercase mb-4">
          Cracking!
        </h2>
        <p className="text-white/60 text-lg">Get ready for the next question…</p>
        <div className="mt-8 flex gap-2">
          {['🥚','🥚','🥚'].map((e, i) => (
            <span key={i} className="text-2xl" style={{ animation: `eggBounce 0.8s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}>{e}</span>
          ))}
        </div>
      </div>
    )
  }

  // ── Winner ───────────────────────────────────────────────────
  if (phoneState === 'winner') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6 text-center easter-eggs-bg">
        <div className="relative z-10">
          <div className="text-8xl mb-4" style={{ animation: 'winnerBurst 0.6s cubic-bezier(0.175,0.885,0.32,1.275) forwards' }}>🏆</div>
          <p className="font-display text-2xl text-gold-400 tracking-widest uppercase mb-2">
            🐰 Easter Champion! 🐰
          </p>
          <p className="font-display text-6xl gold-shimmer tracking-widest uppercase">
            {player?.name}
          </p>
          <p className="text-white/40 mt-4 text-sm">You found the golden egg! 🥇</p>
          <div className="mt-6 text-4xl">🥚🌷🐣🌸🐇</div>
          <p className="text-white/30 text-xs mt-4 animate-pulse">Standby for the bonus round…</p>
        </div>
      </div>
    )
  }

  // ── Higher or Lower bonus game (winner only) ─────────────────
  if (phoneState === 'higher-lower') {
    const shownNumber = game?.bonus_shown_number ?? '?'
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6 text-center">
        <div className="text-6xl mb-4" style={{ animation: 'eggBounce 1.5s ease-in-out infinite' }}>🥚</div>
        <h2 className="font-display text-3xl text-gold-400 tracking-widest uppercase mb-2">
          Bonus Round!
        </h2>
        <p className="text-white/60 text-base mb-6">
          Look at the big screen — are there <strong className="text-white">Higher</strong> or <strong className="text-white">Lower</strong> eggs than…
        </p>

        {/* The shown number */}
        <div className="bg-gold-400 text-cobalt-950 font-display text-8xl rounded-2xl px-8 py-4 mb-8 leading-none">
          {shownNumber}
        </div>

        {/* Higher / Lower buttons */}
        <div className="flex gap-4 w-full max-w-xs">
          <button
            onClick={() => handleBonusAnswer('higher')}
            disabled={bonusSubmitting}
            className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50
                       text-white font-display text-2xl tracking-widest
                       py-5 rounded-2xl uppercase transition-colors active:scale-95"
          >
            ▲ Higher
          </button>
          <button
            onClick={() => handleBonusAnswer('lower')}
            disabled={bonusSubmitting}
            className="flex-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-50
                       text-white font-display text-2xl tracking-widest
                       py-5 rounded-2xl uppercase transition-colors active:scale-95"
          >
            ▼ Lower
          </button>
        </div>

        {bonusSubmitting && (
          <p className="text-white/40 text-sm mt-4 animate-pulse">Checking your answer…</p>
        )}
      </div>
    )
  }

  // ── April Fool (bonus round result — winner always loses) ────
  if (phoneState === 'april-fool') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6 text-center">
        <img
          src="/MrT.jpg"
          alt="Mr T"
          className="w-64 h-auto rounded-2xl mb-5 border-4 border-red-500"
          style={{ animation: 'mrTReveal 0.7s cubic-bezier(0.175,0.885,0.32,1.275) forwards' }}
        />
        <h2
          className="font-display text-4xl text-red-400 tracking-widest uppercase mb-3"
          style={{ animation: 'mrTReveal 0.7s 0.1s ease-out both' }}
        >
          You are another<br />April Fool!
        </h2>
        <p className="text-white/50 text-lg mt-2">
          Gotcha, {player?.name}! 😂
        </p>
        <p className="text-white/25 text-sm mt-2">Nobody escapes Mr T…</p>
      </div>
    )
  }

  // ── Game over (not winner) ───────────────────────────────────
  if (phoneState === 'game-over') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cobalt-900 px-6 text-center">
        <div className="text-7xl mb-6">🐇</div>
        <h2 className="font-display text-4xl text-white/60 tracking-widest uppercase mb-4">
          Hunt&rsquo;s Over!
        </h2>
        {winnerName ? (
          <p className="text-white/60">
            Champion: <span className="text-gold-400 font-display text-2xl">{winnerName} 🏆</span>
          </p>
        ) : (
          <p className="text-white/40">The eggs escaped everyone! 🥚</p>
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
          {game?.status === 'FINAL_QUESTION' ? '⚡ FINAL' : `🥚 Q${(game?.current_question_index ?? 0) + 1}`}
        </span>
        <div className={`font-display text-4xl leading-none w-14 h-14 rounded-full border-4 flex items-center justify-center
                         ${isDanger ? 'border-red-500 text-red-400 timer-danger' : 'border-gold-400 text-gold-400'}`}>
          {timerDisplay > 0 ? timerDisplay : '–'}
        </div>
        <span className="font-display text-sm text-white/40 tracking-widest uppercase">
          {player?.name}
        </span>
      </div>

      {/* Question */}
      <div className="px-5 py-6 flex-shrink-0">
        {game?.status === 'FINAL_QUESTION' && (
          <p className="text-gold-400 font-display text-xs tracking-widest text-center mb-3 uppercase">
            🥇 First correct answer wins! 🥇
          </p>
        )}
        <p className="font-display text-xl md:text-2xl text-white tracking-wide leading-snug text-center"
           style={{ animation: 'questionReveal 0.5s ease-out forwards' }}>
          {question?.question_text}
        </p>
      </div>

      {/* Answer buttons */}
      <div className="flex-1 grid grid-cols-2 gap-3 px-4 pb-6">
        {OPTION_LABELS.map((letter, i) => {
          const optKey   = OPTION_KEYS[i]
          const optValue = question?.[optKey] ?? ''
          if (!optValue) return null
          const color    = OPTION_COLORS[i]
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
              <span className="text-2xl font-bold text-gold-400 mb-2">{letter}</span>
              <span className="text-base leading-snug">{optValue}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
