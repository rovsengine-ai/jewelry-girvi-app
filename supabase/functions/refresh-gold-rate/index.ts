import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Vendor keys live in Edge Function secrets (GOLDAPI_API_KEY / METALS_DEV_API_KEY).
// Never EXPO_PUBLIC_*. Quotes are not IBJA — every persisted row is goldapi,
// metals_dev, or manual. Docs: https://supabase.com/docs/guides/functions/secrets
// GoldAPI: https://www.goldapi.io/api/XAU/INR  header x-access-token
// metals.dev: https://api.metals.dev/v1/latest?currency=INR&unit=g  (metals.gold)

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FeedSource = 'goldapi' | 'metals_dev';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function todayInKolkata(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** API boundary: rupees per gram → paise per 10g, half-up once. */
function rupeesPerGramToPaisePer10g(rupeesPerGram: number): number {
  if (!Number.isFinite(rupeesPerGram) || rupeesPerGram <= 0) {
    throw new Error('Feed returned a non-positive gold price.');
  }
  const paisePerGram = Math.round(rupeesPerGram * 100);
  if (paisePerGram <= 0) {
    throw new Error('Feed rounded to zero paise.');
  }
  return paisePerGram * 10;
}

function resolveProvider(): { source: FeedSource; apiKey: string } | { error: string } {
  const requested = (Deno.env.get('GOLD_RATE_PROVIDER') ?? 'goldapi').trim().toLowerCase();
  if (requested === 'metals_dev' || requested === 'metals.dev') {
    const apiKey = Deno.env.get('METALS_DEV_API_KEY')?.trim() ?? '';
    if (!apiKey) {
      return { error: 'not_configured' };
    }
    return { source: 'metals_dev', apiKey };
  }
  const apiKey = Deno.env.get('GOLDAPI_API_KEY')?.trim() ?? '';
  if (!apiKey) {
    return { error: 'not_configured' };
  }
  return { source: 'goldapi', apiKey };
}

async function fetchGoldapiInrPerGram24k(apiKey: string): Promise<number> {
  const response = await fetch('https://www.goldapi.io/api/XAU/INR', {
    headers: {
      'x-access-token': apiKey,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`GoldAPI HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    price_gram_24k?: number;
    price_gram_24K?: number;
  };
  const perGram = data.price_gram_24k ?? data.price_gram_24K;
  if (typeof perGram !== 'number' || !Number.isFinite(perGram)) {
    throw new Error('GoldAPI response missing price_gram_24k');
  }
  return perGram;
}

async function fetchMetalsDevInrPerGram(apiKey: string): Promise<number> {
  const url = new URL('https://api.metals.dev/v1/latest');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('currency', 'INR');
  url.searchParams.set('unit', 'g');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`metals.dev HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    status?: string;
    metals?: { gold?: number };
  };
  if (data.status && data.status !== 'success') {
    throw new Error(`metals.dev status ${data.status}`);
  }
  const perGram = data.metals?.gold;
  if (typeof perGram !== 'number' || !Number.isFinite(perGram)) {
    throw new Error('metals.dev response missing metals.gold');
  }
  return perGram;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ ok: false, reason: 'unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ ok: false, reason: 'server_misconfigured' }, 500);
    }

    const caller = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ ok: false, reason: 'unauthorized' }, 401);
    }

    const { data: profile, error: profileError } = await caller
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile || (profile.role !== 'owner' && profile.role !== 'staff')) {
      return jsonResponse({ ok: false, reason: 'shop_only' }, 403);
    }

    const provider = resolveProvider();
    if ('error' in provider) {
      return jsonResponse({
        ok: false,
        reason: 'not_configured',
        label: 'not IBJA',
      });
    }

    let rupeesPerGram: number;
    try {
      rupeesPerGram =
        provider.source === 'goldapi'
          ? await fetchGoldapiInrPerGram24k(provider.apiKey)
          : await fetchMetalsDevInrPerGram(provider.apiKey);
    } catch {
      return jsonResponse({
        ok: false,
        reason: 'feed_unavailable',
        source: provider.source,
        label: 'not IBJA',
      });
    }

    let pricePer10gPaise: number;
    try {
      pricePer10gPaise = rupeesPerGramToPaisePer10g(rupeesPerGram);
    } catch {
      return jsonResponse({
        ok: false,
        reason: 'feed_unavailable',
        source: provider.source,
        label: 'not IBJA',
      });
    }

    const quotedOn = todayInKolkata();
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: row, error: upsertError } = await admin
      .from('gold_rates')
      .upsert(
        {
          quoted_on: quotedOn,
          purity_millesimal: 999,
          source: provider.source,
          price_per_10g_paise: pricePer10gPaise,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'quoted_on,purity_millesimal,source' },
      )
      .select('id, quoted_on, purity_millesimal, source, price_per_10g_paise')
      .single();

    if (upsertError || !row) {
      return jsonResponse({
        ok: false,
        reason: 'feed_unavailable',
        source: provider.source,
        label: 'not IBJA',
      });
    }

    return jsonResponse({
      ok: true,
      label: 'not IBJA',
      quoted_on: row.quoted_on,
      purity_millesimal: row.purity_millesimal,
      source: row.source,
      price_per_10g_paise: row.price_per_10g_paise,
    });
  } catch {
    return jsonResponse({ ok: false, reason: 'feed_unavailable', label: 'not IBJA' });
  }
});
