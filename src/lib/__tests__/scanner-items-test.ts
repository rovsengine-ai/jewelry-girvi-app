import {
  convertScannerItem,
  emptyScannerItem,
  scannerItemsReducer,
  type ScannerItemDraft,
} from '@/lib/scanner-items';

function goldDraft(overrides: Partial<ScannerItemDraft> = {}): ScannerItemDraft {
  return {
    ...emptyScannerItem('item-1'),
    metal: 'gold',
    ornament_type: 'Chain',
    gross_grams: '10.5',
    stone_grams: '0.5',
    net_grams: '10',
    quantity: '1',
    ...overrides,
  };
}

describe('emptyScannerItem', () => {
  test('does not default metal or purity — 22 must never be assumed', () => {
    const item = emptyScannerItem('item-1');
    expect(item.metal).toBeNull();
    expect(item.purity_karat).toBeNull();
  });
});

describe('scannerItemsReducer', () => {
  test('OCR seeds item 1 ornament and gross; net defaults to gross minus stone', () => {
    const seeded = scannerItemsReducer([emptyScannerItem('item-1')], {
      type: 'seedFromOcr',
      ornamentType: 'Gold chain',
      grossGrams: '10.5',
    });
    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.ornament_type).toBe('Gold chain');
    expect(seeded[0]?.gross_grams).toBe('10.5');
    expect(seeded[0]?.net_grams).toBe('10.5');
    expect(seeded[0]?.purity_karat).toBeNull();
    expect(seeded[0]?.metal).toBeNull();
  });

  test('patch can attach a local item photo uri', () => {
    const next = scannerItemsReducer([emptyScannerItem('item-1')], {
      type: 'patch',
      key: 'item-1',
      patch: { localPhotoUri: 'file:///cache/item.jpg' },
    });
    expect(next[0]?.localPhotoUri).toBe('file:///cache/item.jpg');
  });

  test('add appends another empty item without inventing purity', () => {
    const next = scannerItemsReducer([emptyScannerItem('item-1')], { type: 'add' });
    expect(next).toHaveLength(2);
    expect(next[1]?.purity_karat).toBeNull();
    expect(next[1]?.metal).toBeNull();
  });

  test('net tracks gross − stone until the operator edits net', () => {
    let state = [emptyScannerItem('item-1')];
    state = scannerItemsReducer(state, {
      type: 'patch',
      key: 'item-1',
      patch: { gross_grams: '12', stone_grams: '2' },
    });
    expect(state[0]?.net_grams).toBe('10');

    state = scannerItemsReducer(state, {
      type: 'patch',
      key: 'item-1',
      patch: { net_grams: '9.5' },
    });
    expect(state[0]?.net_grams).toBe('9.5');

    state = scannerItemsReducer(state, {
      type: 'patch',
      key: 'item-1',
      patch: { stone_grams: '1' },
    });
    expect(state[0]?.net_grams).toBe('9.5');
  });

  test('choosing silver clears any karat that had been set', () => {
    let state: ScannerItemDraft[] = [{ ...emptyScannerItem('item-1'), purity_karat: 22 }];
    state = scannerItemsReducer(state, {
      type: 'patch',
      key: 'item-1',
      patch: { metal: 'silver' },
    });
    expect(state[0]?.purity_karat).toBeNull();
  });

  test('refuses to remove the last item', () => {
    const state = [emptyScannerItem('item-1')];
    expect(scannerItemsReducer(state, { type: 'remove', key: 'item-1' })).toHaveLength(1);
  });

  test('resets to a single empty item', () => {
    let state = [emptyScannerItem('item-1')];
    state = scannerItemsReducer(state, { type: 'add' });
    expect(scannerItemsReducer(state, { type: 'reset' })).toEqual([emptyScannerItem('item-1')]);
  });

  test('seedFromOcr can set metal when clear', () => {
    const seeded = scannerItemsReducer([emptyScannerItem('item-1')], {
      type: 'seedFromOcr',
      ornamentType: 'सोना पेठा',
      grossGrams: '25.8',
      metal: 'gold',
    });
    expect(seeded[0]?.metal).toBe('gold');
    expect(seeded[0]?.ornament_type).toBe('सोना पेठा');
  });
});

describe('convertScannerItem', () => {
  test('converts grams to milligrams and keeps purity unset when not assessed', () => {
    expect(convertScannerItem(goldDraft())).toMatchObject({
      metal: 'gold',
      gross_weight_mg: 10500,
      stone_deduction_mg: 500,
      net_weight_mg: 10000,
      purity_karat: null,
      quantity: 1,
    });
  });

  test('rejects net greater than gross', () => {
    expect(() => convertScannerItem(goldDraft({ net_grams: '11' }))).toThrow(
      'Net weight cannot exceed gross weight.',
    );
  });

  test('requires metal — there is no gold default', () => {
    expect(() => convertScannerItem(goldDraft({ metal: null }))).toThrow(
      'Choose gold or silver for every pledged item.',
    );
  });

  test('silver never carries a karat', () => {
    expect(
      convertScannerItem(goldDraft({ metal: 'silver', purity_karat: 22 })).purity_karat,
    ).toBeNull();
  });
});
