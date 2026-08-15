import { goldPurityLabel, karatToMillesimal, pickRateForMillesimal } from '@/lib/gold-purity';

describe('karatToMillesimal', () => {
  test('maps newspaper bands, including 18K as 75%', () => {
    expect(karatToMillesimal(24)).toBe(999);
    expect(karatToMillesimal(22)).toBe(916);
    expect(karatToMillesimal(18)).toBe(750);
    expect(karatToMillesimal(14)).toBe(585);
    expect(karatToMillesimal(10)).toBe(417);
  });

  test('does not invent a millesimal for an unmapped karat or null', () => {
    expect(karatToMillesimal(null)).toBeNull();
    expect(karatToMillesimal(21)).toBeNull();
  });
});

describe('goldPurityLabel', () => {
  test('names 18K as 75% / 750', () => {
    expect(goldPurityLabel(18)).toBe('18K (75% / 750)');
    expect(goldPurityLabel(22)).toBe('22K (916)');
    expect(goldPurityLabel(null)).toBe('Not assessed');
    expect(goldPurityLabel(null, 'en')).toBe('Not assessed');
    expect(goldPurityLabel(null, 'hi')).toBe('आकलित नहीं');
  });
});

describe('pickRateForMillesimal', () => {
  test('prefers a manual row over a feed row for the same millesimal', () => {
    const picked = pickRateForMillesimal(
      [
        {
          id: 'feed',
          purity_millesimal: 999,
          source: 'goldapi',
        },
        {
          id: 'manual',
          purity_millesimal: 999,
          source: 'manual',
        },
      ],
      999,
    );
    expect(picked?.id).toBe('manual');
  });

  test('returns null when that band is missing', () => {
    expect(
      pickRateForMillesimal([{ id: 'feed', purity_millesimal: 999, source: 'goldapi' }], 916),
    ).toBeNull();
  });
});
