import type { Paise } from '@/lib/money';

export interface GoldRateQuote {
  /** Approximate spot price per gram in paise (integer). */
  pricePerGramPaise: Paise;
  currency: string;
  source: string;
  fetchedAt: string;
}

interface MetalsLiveResponse {
  gold?: number;
}

/**
 * Fetches approximate live gold price per gram in INR paise.
 * Uses Metals.live (USD/oz) with a fixed USD→INR conversion for demo reliability.
 * Float conversion from the external API is rounded to paise once at the boundary.
 */
export async function fetchLiveGoldRatePerGram(): Promise<GoldRateQuote> {
  const response = await fetch('https://api.metals.live/v1/spot/gold');
  if (!response.ok) {
    throw new Error(`Gold rate API failed (${response.status}).`);
  }

  const data = (await response.json()) as MetalsLiveResponse;
  const usdPerOunce = data.gold;
  if (!usdPerOunce || usdPerOunce <= 0) {
    throw new Error('Gold rate API returned invalid data.');
  }

  const usdToInr = 83.5;
  const gramsPerOunce = 31.1034768;
  const pricePerGramRupees = (usdPerOunce * usdToInr) / gramsPerOunce;
  const pricePerGramPaise = Math.round(pricePerGramRupees * 100);

  return {
    pricePerGramPaise,
    currency: 'INR',
    source: 'metals.live (USD spot → INR estimate)',
    fetchedAt: new Date().toISOString(),
  };
}

/** weightGrams may be fractional; result is integer paise. */
export function calculateAssetValue(weightGrams: number, pricePerGramPaise: Paise): Paise {
  if (weightGrams <= 0 || pricePerGramPaise <= 0) {
    return 0;
  }
  return Math.round(weightGrams * pricePerGramPaise);
}
