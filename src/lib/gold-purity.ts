import { translate, type AppLanguage } from '@/i18n';

/** Karat → millesimal. 22K is 916, not 22/24. 18K is 750 (75%). */

export const GOLD_MILLESIMAL_BANDS = [999, 916, 750, 585, 417] as const;

export type GoldMillesimal = (typeof GOLD_MILLESIMAL_BANDS)[number];

const KARAT_TO_MILLESIMAL: Record<number, GoldMillesimal> = {
  24: 999,
  22: 916,
  18: 750,
  14: 585,
  10: 417,
};

export function karatToMillesimal(karat: number | null): GoldMillesimal | null {
  if (karat == null) return null;
  return KARAT_TO_MILLESIMAL[karat] ?? null;
}

export function goldPurityLabel(karat: number | null, language?: AppLanguage): string {
  if (karat == null) return translate('items.purity.notAssessed', undefined, language);
  const millesimal = karatToMillesimal(karat);
  if (millesimal == null) {
    return translate('items.purity.karatOnly', { karat }, language);
  }
  if (karat === 18) return translate('items.purity.k18', undefined, language);
  return translate('items.purity.karatMillesimal', { karat, millesimal }, language);
}

export interface GoldRatePick {
  id: string;
  purity_millesimal: number;
  source: 'goldapi' | 'metals_dev' | 'manual';
}

/** Prefer a manual row for the millesimal, else the first remaining row. */
export function pickRateForMillesimal<T extends GoldRatePick>(
  rates: T[],
  millesimal: number,
): T | null {
  const matches = rates.filter((row) => row.purity_millesimal === millesimal);
  const manual = matches.find((row) => row.source === 'manual');
  return manual ?? matches[0] ?? null;
}
