import { rupeesInputToPaise, todayInKolkata, type Paise } from '@/lib/money';
import { pickRateForMillesimal } from '@/lib/gold-purity';
import { supabase } from '@/lib/supabase';
import type { GoldRate, GoldRateSource } from '@/types/database';

export { pickRateForMillesimal };

export type GoldRateRefreshResult =
  | {
      ok: true;
      label: 'not IBJA';
      quoted_on: string;
      source: GoldRateSource;
      price_per_10g_paise: Paise;
    }
  | {
      ok: false;
      reason: 'not_configured' | 'feed_unavailable' | 'shop_only' | 'unauthorized' | string;
      label: 'not IBJA';
    };

/** Refresh the feed into gold_rates. Never throws — a dead feed must not block the counter. */
export async function refreshGoldRateFeed(): Promise<GoldRateRefreshResult> {
  try {
    const { data, error } = await supabase.functions.invoke<GoldRateRefreshResult>(
      'refresh-gold-rate',
      { body: {} },
    );
    if (error || !data) {
      return { ok: false, reason: 'feed_unavailable', label: 'not IBJA' };
    }
    return { ...data, label: 'not IBJA' };
  } catch {
    return { ok: false, reason: 'feed_unavailable', label: 'not IBJA' };
  }
}

export async function fetchGoldRatesForDate(
  quotedOn: string = todayInKolkata(),
): Promise<GoldRate[]> {
  const { data, error } = await supabase
    .from('gold_rates')
    .select(
      'id, quoted_on, purity_millesimal, source, price_per_10g_paise, fetched_at, created_by',
    )
    .eq('quoted_on', quotedOn)
    .order('fetched_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as GoldRate[];
}

export async function setManualGoldRate(input: {
  quotedOn?: string;
  millesimal: 999 | 916 | 750 | 585 | 417;
  rupeesPer10g: string;
}): Promise<string> {
  const pricePer10gPaise = rupeesInputToPaise(input.rupeesPer10g);
  const { data, error } = await supabase.rpc('set_manual_gold_rate', {
    p_quoted_on: input.quotedOn ?? todayInKolkata(),
    p_millesimal: input.millesimal,
    p_price_per_10g_paise: pricePer10gPaise,
  });
  if (error || typeof data !== 'string') {
    throw new Error(error?.message ?? 'Could not save the manual gold rate.');
  }
  return data;
}
