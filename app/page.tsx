'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [checking, setChecking] = useState(true)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/host')
      else setChecking(false)
    })
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      router.push('/host')
    }
  }

  if (checking) return null

  return (
    <div className="min-h-screen easter-eggs-bg flex items-center justify-center bg-cobalt-900 px-4">
      <div className="w-full max-w-md relative z-10">

        {/* Easter decoration row */}
        <div className="text-center text-4xl mb-4 space-x-3">
          🐰&nbsp;🥚&nbsp;🌷&nbsp;🐣&nbsp;🌸
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl text-gold-400 tracking-widest uppercase mb-1 animate-glow">
            Easter Quiz
          </h1>
          <p className="text-white/40 text-sm tracking-widest uppercase">
            Host Control Panel
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-cobalt-800 border-2 border-cobalt-600 rounded-2xl p-8 space-y-5"
        >
          <div>
            <label className="block text-sm text-white/60 mb-1 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-cobalt-900 border-2 border-cobalt-600 focus:border-gold-400
                         rounded-xl px-4 py-3 text-white outline-none transition-colors"
              placeholder="you@holidayextras.com"
            />
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-1 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-cobalt-900 border-2 border-cobalt-600 focus:border-gold-400
                         rounded-xl px-4 py-3 text-white outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold-400 hover:bg-gold-300 disabled:opacity-50
                       text-cobalt-950 font-display text-2xl tracking-widest
                       py-4 rounded-xl transition-colors uppercase"
          >
            {loading ? 'Signing in…' : '🐣  Sign In'}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-6">
          Host login only — players join by scanning the QR code
        </p>
      </div>
    </div>
  )
}
