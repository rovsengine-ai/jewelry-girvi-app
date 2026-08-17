/**
 * Store / production binaries must talk to hosted Supabase, not Docker on the
 * Mac. Local CLI URLs stay valid in development only.
 */

export function assertSupabasePublicConfig(
  url: string,
  anonKey: string,
  options: { isDev: boolean } = { isDev: __DEV__ },
): void {
  if (!url.trim() || !anonKey.trim()) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  if (options.isDev) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not a valid URL.');
  }

  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:') {
    throw new Error('Production Girvi Shop builds must use an https:// hosted Supabase URL.');
  }
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    throw new Error('Production Girvi Shop builds cannot use a local Supabase URL.');
  }
}
