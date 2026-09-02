import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

const getSupabaseProjectRef = () => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0];
  } catch {
    return '';
  }
};

const isCorruptAuthStorageError = (error) =>
  String(error?.message || '').includes("Cannot read properties of undefined (reading 'split')");

const clearLocalSupabaseAuthStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const projectRef = getSupabaseProjectRef();
  Object.keys(window.localStorage)
    .filter((key) =>
      key.includes('auth-token-code-verifier')
      || key.includes('code-verifier')
      || (projectRef && key.startsWith(`sb-${projectRef}-auth-token`))
    )
    .forEach((key) => window.localStorage.removeItem(key));
};

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const getCurrentSession = async () => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch (error) {
    if (isCorruptAuthStorageError(error)) {
      clearLocalSupabaseAuthStorage();
      return null;
    }
    throw error;
  }
};

export const signInWithGoogle = async () => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.is_anonymous) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      clearLocalSupabaseAuthStorage();
    }
  } catch (error) {
    if (isCorruptAuthStorageError(error)) {
      clearLocalSupabaseAuthStorage();
    } else {
      throw error;
    }
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });
  if (error) throw error;
  if (!data?.url) {
    throw new Error('Google OAuth URL was not returned.');
  }
  window.location.assign(data.url);
};

export const signOut = async () => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const ensureAnonymousSession = async () => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  try {
    const { data: existing, error: existingError } = await supabase.auth.getSession();
    if (existingError) throw existingError;
    if (existing.session?.user) return existing.session;
  } catch (error) {
    if (isCorruptAuthStorageError(error)) {
      clearLocalSupabaseAuthStorage();
    } else {
      throw error;
    }
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
};
