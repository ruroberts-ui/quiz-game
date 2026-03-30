'use client'

import { createBrowserClient } from '@supabase/ssr'

// Used in client components and pages for reading data and Realtime subscriptions.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
