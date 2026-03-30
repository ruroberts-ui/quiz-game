'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { ParsedQuestion } from '@/lib/types'

type Step = 'upload' | 'preview' | 'creating'

export default function HostDashboard() {
  const [step, setStep]             = useState<Step>('upload')
  const [questions, setQuestions]   = useState<ParsedQuestion[]>([])
  const [parseError, setParseError] = useState('')
  const [uploading, setUploading]   = useState(false)
  const [creating, setCreating]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router  = useRouter()
  const supabase = createClient()

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError('')
    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData })
    const data = await res.json()

    setUploading(false)
    if (!res.ok) {
      setParseError(data.error || 'Could not parse PDF')
      return
    }
    setQuestions(data.questions)
    setStep('preview')
  }

  async function handleCreate() {
    setCreating(true)
    const res = await fetch('/api/create-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Failed to create game')
      setCreating(false)
      return
    }
    router.push(`/host/${data.gameId}`)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const LETTER = ['A', 'B', 'C', 'D'] as const

  return (
    <div className="min-h-screen bg-cobalt-900 px-4 py-8">
      {/* Header */}
      <div className="max-w-3xl mx-auto flex items-center justify-between mb-10">
        <h1 className="font-display text-4xl text-gold-400 tracking-widest uppercase">
          QUIZ MASTER
        </h1>
        <button
          onClick={handleSignOut}
          className="text-white/40 hover:text-white/70 text-sm transition-colors"
        >
          Sign out
        </button>
      </div>

      <div className="max-w-3xl mx-auto">
        {/* ── STEP 1: Upload ────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="bg-cobalt-800 border-2 border-cobalt-600 rounded-xl p-8">
            <h2 className="font-display text-3xl text-gold-400 tracking-wide mb-2">
              New Game
            </h2>
            <p className="text-white/60 mb-8">
              Upload a PDF with your questions. Use the template format (Q1, Q2… with A) B) C) D) options and Answer: X lines).
            </p>

            <div
              onClick={() => fileRef.current?.click()}
              className="border-4 border-dashed border-cobalt-600 hover:border-gold-500
                         rounded-xl p-16 text-center cursor-pointer transition-colors group"
            >
              <div className="text-6xl mb-4">📄</div>
              <p className="font-display text-2xl text-gold-400 group-hover:text-gold-300 tracking-wide">
                {uploading ? 'Parsing PDF…' : 'Click to upload PDF'}
              </p>
              <p className="text-white/40 text-sm mt-2">Up to 10 questions, multiple-choice A–D</p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />

            {parseError && (
              <div className="mt-4 p-4 bg-red-900/40 border border-red-500 rounded-lg text-red-300">
                <strong>Error:</strong> {parseError}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Preview ───────────────────────────────────── */}
        {step === 'preview' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-3xl text-gold-400 tracking-wide">
                Preview — {questions.length} Question{questions.length !== 1 ? 's' : ''}
              </h2>
              <button
                onClick={() => { setStep('upload'); setQuestions([]); if (fileRef.current) fileRef.current.value = '' }}
                className="text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                ← Re-upload
              </button>
            </div>

            <div className="space-y-4 mb-8">
              {questions.map((q) => (
                <div
                  key={q.question_index}
                  className="bg-cobalt-800 border-2 border-cobalt-600 rounded-xl p-6"
                >
                  <p className="font-display text-gold-400 text-sm tracking-wider mb-2">
                    QUESTION {q.question_index + 1}
                  </p>
                  <p className="text-white text-lg font-semibold mb-4">{q.question_text}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['a', 'b', 'c', 'd'] as const).map((l, i) => {
                      const isAnswer = q.correct_answer.toUpperCase() === LETTER[i]
                      return (
                        <div
                          key={l}
                          className={`px-3 py-2 rounded-lg text-sm border-2 ${
                            isAnswer
                              ? 'border-green-400 bg-green-900/30 text-green-300 font-semibold'
                              : 'border-cobalt-600 text-white/70'
                          }`}
                        >
                          <span className="font-display mr-1">{LETTER[i]})</span>
                          {q[`option_${l}`]}
                          {isAnswer && ' ✓'}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full bg-gold-500 hover:bg-gold-400 disabled:opacity-50
                         text-cobalt-950 font-display text-2xl tracking-widest
                         py-5 rounded-xl transition-colors uppercase"
            >
              {creating ? 'Creating Game…' : `Create Game & Get QR Code →`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
