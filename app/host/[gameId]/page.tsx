'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/lib/supabase'
import type { Game, Question, Player, Answer } from '@/lib/types'
import {
  playGameStart, playQuestionReveal, playCountdownTick,
  playCountdownPanic, playElimination, playWinner,
} from '@/lib/sounds'

type RoundPhase = 'playing' | 'results'

export default function MasterScreen() {
  const { gameId } = useParams<{ gameId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [game, setGame]           = useState<Game | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [players, setPlayers]     = useState<Player[]>([])
  const [answers, setAnswers]     = useState<Answer[]>([])
  const [roundPhase, setRoundPhase] = useState<RoundPhase>('playing')
  const [timeLeft, setTimeLeft]   = useState(10)
  const [eliminatingIds, setEliminatingIds] = useState<Set<string>>(new Set())
  const [winner, setWinner]       = useState<Player | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [startingGame, setStartingGame] = useState(false)
  const [isAdvancing, setIsAdvancing]   = useState(false)

  const processedRef  = useRef(false)   // prevent double-calling process-round
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevIndexRef  = useRef<number>(-1)
  const prevStatusRef = useRef<string>('')

  // Use window.location.origin so the QR code always points to the
  // correct domain automatically — works on localhost AND on Vercel.
  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${gameId}`
    : ''

  // ── Initial data load ────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [{ data: g }, { data: q }, { data: p }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        supabase.from('questions').select('*').eq('game_id', gameId).order('question_index'),
        supabase.from('players').select('*').eq('game_id', gameId).order('joined_at'),
      ])
      if (g) setGame(g)
      if (q) setQuestions(q)
      if (p) setPlayers(p)

      // If game already has a winner, load them
      if (g?.winner_player_id && p) {
        const w = p.find((pl: Player) => pl.id === g.winner_player_id)
        if (w) setWinner(w)
      }

      // If mid-game, load answers for current question
      if (g && q && (g.status === 'IN_PROGRESS' || g.status === 'FINAL_QUESTION')) {
        const currentQ = q.find((qu: Question) => qu.question_index === g.current_question_index)
        if (currentQ) {
          const { data: a } = await supabase.from('answers').select('*').eq('question_id', currentQ.id)
          if (a) setAnswers(a)
        }
      }
    }
    load()
  }, [gameId])

  // ── Realtime: game changes ───────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel(`master-game-${gameId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        async (payload) => {
          const updated = payload.new as Game
          const prevStatus = prevStatusRef.current
          const prevIndex  = prevIndexRef.current
          setGame(updated)
          prevStatusRef.current = updated.status

          // New question started
          if (updated.question_started_at &&
              (updated.current_question_index !== prevIndex ||
               (prevStatus !== 'IN_PROGRESS' && prevStatus !== 'FINAL_QUESTION'))) {
            prevIndexRef.current = updated.current_question_index
            setRoundPhase('playing')
            setAnswers([])
            processedRef.current = false
            // Load answers for the new question
            const currentQ = questions.find(q => q.question_index === updated.current_question_index)
            if (currentQ) {
              const { data: a } = await supabase.from('answers').select('*').eq('question_id', currentQ.id)
              if (a) setAnswers(a)
            }
            playQuestionReveal()
          }

          // Game complete — find winner
          if (updated.status === 'COMPLETE' && updated.winner_player_id) {
            setPlayers(prev => {
              const w = prev.find(p => p.id === updated.winner_player_id)
              if (w) setWinner(w)
              return prev
            })
            playWinner()
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId, questions])

  // ── Realtime: players joining / being eliminated ─────────────
  useEffect(() => {
    const channel = supabase.channel(`master-players-${gameId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        (payload) => { setPlayers(prev => [...prev, payload.new as Player]) }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const updated = payload.new as Player
          setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p))
          // Trigger elimination animation
          if (updated.is_eliminated) {
            setEliminatingIds(prev => new Set(prev).add(updated.id))
            playElimination()
            setTimeout(() => {
              setEliminatingIds(prev => {
                const next = new Set(prev)
                next.delete(updated.id)
                return next
              })
            }, 800)
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  // ── Realtime: answers coming in ──────────────────────────────
  useEffect(() => {
    const channel = supabase.channel(`master-answers-${gameId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers' },
        (payload) => {
          const a = payload.new as Answer
          setAnswers(prev => {
            if (prev.some(x => x.id === a.id)) return prev
            return [...prev, a]
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  // ── Countdown timer ──────────────────────────────────────────
  const processRound = useCallback(async () => {
    if (processedRef.current || isProcessing) return
    processedRef.current = true
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/games/${gameId}/process-round`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setRoundPhase('results')
        // If game is now complete (0 or 1 survivors), the Realtime update handles it
      }
    } finally {
      setIsProcessing(false)
    }
  }, [gameId, isProcessing])

  useEffect(() => {
    if (!game?.question_started_at) return
    if (game.status !== 'IN_PROGRESS' && game.status !== 'FINAL_QUESTION') return
    if (roundPhase === 'results') return

    const startTime = new Date(game.question_started_at).getTime()
    const DURATION  = 10

    if (timerRef.current) clearInterval(timerRef.current)
    processedRef.current = false

    timerRef.current = setInterval(() => {
      const elapsed   = (Date.now() - startTime) / 1000
      const remaining = Math.max(0, DURATION - elapsed)
      setTimeLeft(remaining)

      // Sound effects
      if (remaining <= 3 && remaining > 0) playCountdownPanic()
      else if (remaining > 3 && Math.abs(remaining - Math.round(remaining)) < 0.15) playCountdownTick()

      if (remaining <= 0) {
        clearInterval(timerRef.current!)
        // Grace period of 600ms for in-transit answers
        setTimeout(() => processRound(), 600)
      }
    }, 100)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [game?.question_started_at, game?.status, roundPhase])

  // ── Actions ──────────────────────────────────────────────────
  async function handleStart() {
    setStartingGame(true)
    await fetch(`/api/games/${gameId}/start`, { method: 'POST' })
    playGameStart()
    setStartingGame(false)
  }

  async function handleNextQuestion() {
    setIsAdvancing(true)
    await fetch(`/api/games/${gameId}/next-question`, { method: 'POST' })
    setIsAdvancing(false)
  }

  // ── Derived state ────────────────────────────────────────────
  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cobalt-900">
        <p className="font-display text-2xl text-gold-400 tracking-widest animate-pulse">LOADING…</p>
      </div>
    )
  }

  const currentQuestion = questions.find(q => q.question_index === game.current_question_index)
  const surviving       = players.filter(p => !p.is_eliminated)
  const answeredIds     = new Set(answers.map(a => a.player_id))
  const timerDisplay    = Math.ceil(timeLeft)
  const isDanger        = timeLeft <= 3 && timeLeft > 0

  // ── COMPLETE screen ──────────────────────────────────────────
  if (game.status === 'COMPLETE') {
    return (
      <div className="min-h-screen scanlines flex flex-col items-center justify-center bg-cobalt-900 px-8 text-center">
        <div className="animate-winnerBurst">
            <div className="text-5xl mb-4 tracking-widest">🥚🌷🐣🌸🐇</div>
          <p className="font-display text-2xl text-gold-400 tracking-[0.3em] uppercase mb-4">
            🐰 Easter Champion! 🐰
          </p>
          {winner ? (
            <h1 className="font-display text-8xl md:text-9xl gold-shimmer uppercase tracking-wider leading-none">
              {winner.name}
            </h1>
          ) : (
            <h1 className="font-display text-5xl text-white/60 uppercase">
              The eggs escaped! 🥚
            </h1>
          )}
        </div>
        <button
          onClick={() => router.push('/host')}
          className="mt-16 bg-gold-500 hover:bg-gold-400 text-cobalt-950
                     font-display text-xl tracking-widest px-8 py-4 rounded-xl uppercase"
        >
          New Game
        </button>
      </div>
    )
  }

  // ── LOBBY screen ─────────────────────────────────────────────
  if (game.status === 'LOBBY') {
    return (
      <div className="min-h-screen scanlines bg-cobalt-900 flex flex-col items-center justify-center px-6 py-8">
        <div className="text-center mb-2 text-3xl opacity-50 tracking-widest select-none">
          🥚🐰🌷🐣🌸🐇🥚🐰🌷🐣🌸🐇
        </div>
        <h1 className="font-display text-5xl text-gold-400 tracking-widest uppercase mb-8"
            style={{ animation: 'glow 3s ease-in-out infinite' }}>
          🐰 Easter Quiz 🐣
        </h1>

        <div className="grid md:grid-cols-2 gap-10 w-full max-w-5xl">
          {/* QR Code */}
          <div className="flex flex-col items-center bg-cobalt-800 border-2 border-cobalt-600 rounded-2xl p-8">
            <p className="font-display text-xl text-white/60 tracking-widest mb-2 uppercase">
              🐰 Scan to join the Easter hunt
            </p>
            <p className="text-white/30 text-xs mb-5">No login needed — just scan &amp; type a name</p>
            <div className="bg-white p-4 rounded-xl border-4 border-gold-400">
              <QRCodeSVG value={joinUrl} size={220} />
            </div>
            <p className="mt-3 text-white/30 text-xs break-all text-center">{joinUrl}</p>
          </div>

          {/* Player list */}
          <div className="bg-cobalt-800 border-2 border-cobalt-600 rounded-2xl p-8 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-xl text-white/60 tracking-widest uppercase">
                🥚 Players in the warren
              </p>
              <span className="font-display text-3xl text-gold-400">{players.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-[180px]">
              {players.length === 0 ? (
                <p className="text-white/30 text-center mt-8 text-sm">
                  Waiting for players to scan the QR code… 🐇
                </p>
              ) : (
                players.map((p, i) => (
                  <div
                    key={p.id}
                    className="bg-cobalt-700 border border-cobalt-600 rounded-full px-4 py-2
                               font-display text-lg text-white tracking-wide text-center"
                    style={{ animation: 'hopIn 0.4s ease-out forwards', animationDelay: `${i * 60}ms`, opacity: 0 }}
                  >
                    🥚 {p.name}
                  </div>
                ))
              )}
            </div>

            <button
              onClick={handleStart}
              disabled={players.length === 0 || startingGame}
              className="mt-6 w-full bg-gold-400 hover:bg-gold-300 disabled:opacity-40
                         text-cobalt-950 font-display text-2xl tracking-widest
                         py-4 rounded-2xl uppercase transition-colors"
            >
              {startingGame ? '🐣 Starting…' : `🐰 Start the Egg Hunt! (${players.length} player${players.length !== 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── IN_PROGRESS / FINAL_QUESTION screen ──────────────────────
  return (
    <div className="min-h-screen scanlines bg-cobalt-900 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-cobalt-950 border-b-2 border-cobalt-700">
        <span className="font-display text-lg text-gold-400 tracking-widest">🐰 EASTER QUIZ</span>
        <span className="font-display text-sm text-white/40 tracking-widest">
          {game.status === 'FINAL_QUESTION' ? '⚡ FINAL QUESTION' : `Q${game.current_question_index + 1} of ${questions.length}`}
        </span>
        <span className="font-display text-lg text-white/50">
          {surviving.length} remaining
        </span>
      </div>

      {/* Question area — top half */}
      <div className="flex-1 flex flex-col px-8 py-6" style={{ maxHeight: '55vh' }}>
        {currentQuestion && (
          <div className="animate-questionReveal h-full flex flex-col">
            {game.status === 'FINAL_QUESTION' && (
              <div className="text-center mb-3">
                <span className="inline-block bg-gold-400 text-cobalt-950 font-display text-sm
                                 tracking-widest px-4 py-1 rounded-full uppercase">
                  🥇 First correct answer wins the golden egg! 🥇
                </span>
              </div>
            )}

            {/* Timer */}
            <div className="flex justify-center mb-4">
              <div className={`font-display text-7xl leading-none w-24 h-24 rounded-full
                               border-4 flex items-center justify-center
                               ${isDanger
                                 ? 'border-red-500 text-red-400 timer-danger'
                                 : 'border-gold-400 text-gold-400'}`}>
                {timerDisplay > 0 ? timerDisplay : '–'}
              </div>
            </div>

            {/* Question text */}
            <h2 className="font-display text-3xl md:text-4xl text-white tracking-wide text-center mb-4">
              {currentQuestion.question_text}
            </h2>

            {/* Options */}
            <div className="grid grid-cols-2 gap-3">
              {(['a', 'b', 'c', 'd'] as const).map((l, i) => {
                const letter   = ['A', 'B', 'C', 'D'][i]
                const optValue = [currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d][i]
                if (!optValue) return null
                const isRight = roundPhase === 'results' && currentQuestion.correct_answer === letter
                const isWrong = roundPhase === 'results' && currentQuestion.correct_answer !== letter
                return (
                  <div
                    key={l}
                    className={`px-4 py-3 rounded-xl border-4 font-display text-xl tracking-wide
                                transition-colors duration-500
                                ${isRight ? 'border-green-400 bg-green-900/50 text-green-300' :
                                  isWrong ? 'border-cobalt-700 text-white/30' :
                                  'border-cobalt-600 bg-cobalt-800 text-white'}`}
                  >
                    <span className="text-gold-400 mr-2">{letter})</span>
                    {optValue}
                    {isRight && ' ✓'}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Player grid — bottom half */}
      <div className="bg-cobalt-950 border-t-2 border-cobalt-700 px-6 py-4"
           style={{ minHeight: '30vh' }}>
        <div className="flex flex-wrap gap-2 justify-center">
          {players.map(p => {
            const isEliminating = eliminatingIds.has(p.id)
            const hasAnswered    = answeredIds.has(p.id)
            if (p.is_eliminated && !isEliminating) return null
            return (
              <div
                key={p.id}
                className={`player-chip ${isEliminating ? 'eliminating' : ''} ${hasAnswered && !p.is_eliminated ? 'answered' : ''}`}
              >
                {p.name}
              </div>
            )
          })}
        </div>

        {/* Next question button (shown after round is processed) */}
        {roundPhase === 'results' && (
          <div className="flex justify-center mt-4">
            <button
              onClick={handleNextQuestion}
              disabled={isAdvancing}
              className="bg-gold-500 hover:bg-gold-400 disabled:opacity-50
                         text-cobalt-950 font-display text-xl tracking-widest
                         px-10 py-4 rounded-xl uppercase animate-slideUp"
            >
              {isAdvancing ? '🐣 Loading…' : game.status === 'FINAL_QUESTION' ? '🏁 End Game' : '🥚 Next Question →'}
            </button>
          </div>
        )}

        {roundPhase === 'playing' && isProcessing && (
          <p className="text-center text-white/40 font-display tracking-widest mt-4 animate-pulse">
            PROCESSING…
          </p>
        )}
      </div>
    </div>
  )
}
