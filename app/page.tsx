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
  const router  = useRouter()
  const supabase = createClient()

  // If already logged in, go straight to host dashboard
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
    <div className="min-h-screen flex items-center justify-center bg-cobalt-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <h1 className="font-display text-6xl text-gold-400 tracking-widest uppercase mb-2 animate-glow">
            QUIZ MASTER
          </h1>
          <p className="text-cobalt-600 text-sm tracking-widest uppercase text-white/40">
            Host Control Panel
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-cobalt-800 border-2 border-cobalt-600 rounded-xl p-8 space-y-5"
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
                         rounded-lg px-4 py-3 text-white outline-none transition-colors"
              placeholder="you@example.com"
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
                         rounded-lg px-4 py-3 text-white outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold-500 hover:bg-gold-400 disabled:opacity-50
                       text-cobalt-950 font-display text-2xl tracking-widest
                       py-4 rounded-lg transition-colors uppercase"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-white/30 text-xs mt-6">
          Use your Supabase email/password account
        </p>
      </div>
    </div>
  )
}
