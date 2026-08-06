import { createBrowserClient } from '@supabase/ssr'
import { buildCookieOptions } from './cookieOptions'

/**
 * Supabase client for browser/client-component code.
 * `createBrowserClient` is a singleton by default, so repeated calls are cheap.
 *
 * Supports both NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred) and the legacy
 * NEXT_PUBLIC_SUPABASE_ANON_KEY name for backwards compatibility.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: buildCookieOptions() },
  )
}
