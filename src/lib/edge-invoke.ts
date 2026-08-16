import { supabase } from '@/lib/supabase';

export type EdgeFunctionErrorBody = {
  error?: string;
  message?: string;
  code?: string;
};

/**
 * Edge Functions need the user access token (not the anon key). Refresh when
 * close to expiry so local invokes do not return a misleading 401 / non-2xx.
 */
export async function requireUserAccessToken(): Promise<string> {
  const { data: initial, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message);
  }

  let session = initial.session;
  const expiresAtMs = (session?.expires_at ?? 0) * 1000;
  const needsRefresh = !session?.access_token || expiresAtMs < Date.now() + 60_000;

  if (needsRefresh) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw new Error(refreshError.message);
    }
    session = refreshed.session;
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('Not signed in.');
  }
  return accessToken;
}

export async function readEdgeFunctionErrorBody(error: unknown): Promise<EdgeFunctionErrorBody | null> {
  if (!error || typeof error !== 'object') return null;
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    const body = (await context.json()) as EdgeFunctionErrorBody;
    if (!body.error && typeof body.message === 'string') {
      body.error = body.message;
    }
    return body;
  } catch {
    try {
      const text = await context.text();
      return text.trim() ? { error: text.trim() } : null;
    } catch {
      return null;
    }
  }
}

export function edgeFunctionErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim();
    if (message && !message.toLowerCase().includes('non-2xx')) {
      return message;
    }
  }
  return fallback;
}
