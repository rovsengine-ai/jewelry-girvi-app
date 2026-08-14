import type { PledgeMetal } from '@/types/database';
import { gramsInputToMg, mgToGramsInput } from '@/lib/weight';

export type { PledgeMetal };

/**
 * Counter draft of one pledged ornament. Grams stay as input strings until
 * save, where gramsInputToMg converts them. metal and purity_karat start unset.
 */
export interface ScannerItemDraft {
  key: string;
  metal: PledgeMetal | null;
  ornament_type: string;
  description: string;
  gross_grams: string;
  stone_grams: string;
  net_grams: string;
  netManuallyEdited: boolean;
  /** null = not assessed. Never default this to 22. Silver always stays null. */
  purity_karat: number | null;
  quantity: string;
}

export type ScannerItemsAction =
  | { type: 'seedFromOcr'; ornamentType: string; grossGrams: string }
  | { type: 'add' }
  | { type: 'remove'; key: string }
  | { type: 'patch'; key: string; patch: Partial<Omit<ScannerItemDraft, 'key'>> };

export function emptyScannerItem(key: string): ScannerItemDraft {
  return {
    key,
    metal: null,
    ornament_type: '',
    description: '',
    gross_grams: '',
    stone_grams: '0',
    net_grams: '',
    netManuallyEdited: false,
    purity_karat: null,
    quantity: '1',
  };
}

function defaultNetGrams(grossGrams: string, stoneGrams: string): string {
  try {
    const gross = gramsInputToMg(grossGrams);
    const stone = gramsInputToMg(stoneGrams.trim() === '' ? '0' : stoneGrams);
    const net = gross - stone;
    if (net <= 0) return '';
    return mgToGramsInput(net);
  } catch {
    return '';
  }
}

function applyPatch(
  item: ScannerItemDraft,
  patch: Partial<Omit<ScannerItemDraft, 'key'>>,
): ScannerItemDraft {
  const next: ScannerItemDraft = { ...item, ...patch };

  if (patch.net_grams !== undefined) {
    next.netManuallyEdited = true;
  }

  if (next.metal === 'silver') {
    next.purity_karat = null;
  }

  const weightsChanged = patch.gross_grams !== undefined || patch.stone_grams !== undefined;
  if (!next.netManuallyEdited && weightsChanged) {
    next.net_grams = defaultNetGrams(next.gross_grams, next.stone_grams);
  }

  return next;
}

export function scannerItemsReducer(
  state: ScannerItemDraft[],
  action: ScannerItemsAction,
): ScannerItemDraft[] {
  switch (action.type) {
    case 'seedFromOcr': {
      const first = state[0] ?? emptyScannerItem('item-1');
      return [
        applyPatch(first, {
          ornament_type: action.ornamentType,
          gross_grams: action.grossGrams,
        }),
        ...state.slice(1),
      ];
    }
    case 'add':
      return [...state, emptyScannerItem(`item-${state.length + 1}`)];
    case 'remove':
      if (state.length <= 1) return state;
      return state.filter((item) => item.key !== action.key);
    case 'patch':
      return state.map((item) =>
        item.key === action.key ? applyPatch(item, action.patch) : item,
      );
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export interface ConvertedPledgeItem {
  metal: PledgeMetal;
  ornament_type: string;
  description: string | null;
  gross_weight_mg: number;
  net_weight_mg: number;
  stone_deduction_mg: number;
  purity_karat: number | null;
  quantity: number;
}

/** Convert a draft to milligrams and enforce metal, net≤gross, and quantity. */
export function convertScannerItem(item: ScannerItemDraft): ConvertedPledgeItem {
  if (item.metal !== 'gold' && item.metal !== 'silver') {
    throw new Error('Choose gold or silver for every pledged item.');
  }

  const ornament = item.ornament_type.trim();
  if (!ornament) {
    throw new Error('Each pledged item needs an ornament type.');
  }

  const gross = gramsInputToMg(item.gross_grams);
  const stone = gramsInputToMg(item.stone_grams.trim() === '' ? '0' : item.stone_grams);
  const net = gramsInputToMg(item.net_grams);

  if (gross <= 0) {
    throw new Error('Gross weight must be greater than zero.');
  }
  if (net <= 0) {
    throw new Error('Net weight must be greater than zero.');
  }
  if (net > gross) {
    throw new Error('Net weight cannot exceed gross weight.');
  }
  if (stone < 0) {
    throw new Error('Stone deduction cannot be negative.');
  }

  const quantity = Number.parseInt(item.quantity.trim(), 10);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Quantity must be a whole number of at least 1.');
  }

  let purity: number | null = item.purity_karat;
  if (item.metal === 'silver') {
    purity = null;
  } else if (purity !== null && (purity < 1 || purity > 24)) {
    throw new Error('Gold purity must be between 1 and 24 karat, or not assessed.');
  }

  return {
    metal: item.metal,
    ornament_type: ornament,
    description: item.description.trim() || null,
    gross_weight_mg: gross,
    net_weight_mg: net,
    stone_deduction_mg: stone,
    purity_karat: purity,
    quantity,
  };
}
