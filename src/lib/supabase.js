import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const ensureAnonymousSession = async () => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data: existing, error: existingError } = await supabase.auth.getSession();
  if (existingError) throw existingError;
  if (existing.session?.user) return existing.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
};
