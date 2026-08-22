import { goldPurityLabel, karatToMillesimal } from '@/lib/gold-purity';

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
