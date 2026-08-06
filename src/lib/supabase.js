import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Set at build time so the app can render a helpful setup screen instead of a
 * blank page with a console error when .env.local is missing.
 */
export const isConfigured = Boolean(url && anonKey)

if (!isConfigured && import.meta.env.DEV) {
  console.warn(
    '[KCSL] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.\n' +
    'Copy .env.example to .env.local, fill it in, then RESTART `npm run dev` — ' +
    'Vite only reads env files at startup.'
  )
}

/**
 * Supabase client singleton.
 *
 * This ships the publishable (anon) key to every visitor's browser, by design
 * (docs Section 8.1). It is harmless only because every table has RLS policies
 * — see supabase_schema.sql. Never put the service_role key in a VITE_ var.
 */
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,  // no magic-link / OAuth flows in this app
      },
    })
  : null
