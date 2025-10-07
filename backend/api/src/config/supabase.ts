import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321'
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'test-anon-key'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'

if ((!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  Supabase credentials not configured. Auth features will not work.')
}

// Client for public operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Client with service role for admin operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export interface SupabaseConfig {
    url: string
    anonKey: string
    serviceRoleKey: string
}

export function getSupabaseConfig(): SupabaseConfig {
    return {
        url: supabaseUrl,
        anonKey: supabaseAnonKey,
        serviceRoleKey: supabaseServiceKey,
    }
}
