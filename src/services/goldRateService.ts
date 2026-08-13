export interface GoldRateQuote {
  pricePerGramInr: number;
  currency: string;
  source: string;
  fetchedAt: string;
}

interface MetalsLiveResponse {
  gold?: number;
}

/**
 * Fetches approximate live gold price per gram in INR.
 * Uses Metals.live (USD/oz) with a fixed USD→INR conversion for demo reliability.
 * Replace with your preferred Indian bullion API in production.
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
  const pricePerGramInr = (usdPerOunce * usdToInr) / gramsPerOunce;

  return {
    pricePerGramInr: Math.round(pricePerGramInr * 100) / 100,
    currency: 'INR',
    source: 'metals.live (USD spot → INR estimate)',
    fetchedAt: new Date().toISOString(),
  };
}

export function calculateAssetValue(weightGrams: number, pricePerGramInr: number): number {
  if (weightGrams <= 0 || pricePerGramInr <= 0) {
    return 0;
  }
  return Math.round(weightGrams * pricePerGramInr * 100) / 100;
}
